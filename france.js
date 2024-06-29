document.addEventListener('DOMContentLoaded', () => {
    const map = L.map('map').setView([46.603354, 1.888334], 6); // Centered on France

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    let geojsonLayer;
    let electionData; // Variable to store the election data

    // Create a custom control for the tooltip
    const tooltipControl = L.control({ position: 'topright' });

    tooltipControl.onAdd = function (map) {
        const div = L.DomUtil.create('div', 'custom-tooltip');
        div.innerHTML = '<h4>Hover over a region</h4>';
        return div;
    };

    tooltipControl.addTo(map);

    function updateTooltipContent(content) {
        const tooltipDiv = document.querySelector('.custom-tooltip');
        if (tooltipDiv) {
            tooltipDiv.innerHTML = content;
        }
    }

    function loadShapefile(url, map, callback) {
        fetch(url)
            .then(response => response.arrayBuffer())
            .then(data => {
                shp(data).then(geojson => {
                    geojsonLayer = L.geoJSON(geojson, {
                        onEachFeature: onEachFeature
                    }).addTo(map);
                    console.log('Shapefile loaded:', geojson); // Log the loaded shapefile
                    callback(geojsonLayer);
                });
            })
            .catch(error => {
                console.error('Error loading shapefile:', error);
            });
    }

    function loadExcelData(url, callback) {
        fetch(url)
            .then(response => response.arrayBuffer())
            .then(data => {
                const workbook = XLSX.read(new Uint8Array(data), { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const sheet = workbook.Sheets[sheetName];
                const jsonData = XLSX.utils.sheet_to_json(sheet);
                console.log('Excel data loaded:', jsonData); // Log the loaded Excel data
                electionData = jsonData; // Store the data in the global variable
                callback(jsonData);
            })
            .catch(error => {
                console.error('Error loading Excel data:', error);
            });
    }

    function integrateData(layer, data) {
        // Log all IDs from the Excel data
        console.log('Excel IDs:', data.map(d => d.ID));

        layer.eachLayer(function (featureLayer) {
            const feature = featureLayer.feature;
            console.log('Feature properties:', feature.properties); // Log the properties of each feature
            const id = feature.properties.REF?.trim().toLowerCase(); // Adjust this based on your shapefile properties
            console.log('Shapefile ID:', id); // Log the ID from the shapefile
            const electionResult = data.find(d => d.ID.trim().toLowerCase() === id); // Match based on Excel's ID column

            console.log(`Processing feature ID: ${id}`); // Log the processing feature ID

            if (electionResult) {
                console.log(`Match found for ID: ${id}`, electionResult); // Log the match found

                const parties = [
                    'ENS', 'NFP', 'RN', 'UDC', 'REC', 'ECO',
                    'DSV', 'RDG', 'DXG', 'DVG', 'DVC', 'DVD', 'REG', 'DIV'
                ];

                // Create an array of party percentages with party names
                let partyPercentages = parties.map(party => {
                    return { party: party, percentage: parseFloat(electionResult[party]) };
                });

                // Filter out parties with 0 percentage and sort the remaining by percentage in descending order
                partyPercentages = partyPercentages.filter(p => p.percentage > 0)
                    .sort((a, b) => b.percentage - a.percentage);

                let barDetails = '';
                partyPercentages.forEach(p => {
                    const color = getColor(p.party, 100); // Use the party color
                    barDetails += `
                        <div class="bar-container">
                            <div class="bar" style="width: ${p.percentage * 100}%; background-color: ${color};"></div>
                            <span class="bar-label">${p.party} (${(p.percentage * 100).toFixed(1)}%)</span>
                        </div>`;
                });

                const popupContent = `
                    <b>Department:</b> ${electionResult.Department || 'Unknown'}<br>
                    <b>Circonscription:</b> ${electionResult.Circonscription || 'Unknown'}<br>
                    <b>Previous Leading:</b> ${electionResult.Previous || 'Unknown'}<br>
                    <b>Current Leading:</b> ${electionResult.Winner || 'Unknown'}<br>
                    <div class="chart-container">
                        ${barDetails}
                    </div>
                `;

                featureLayer.bindPopup(popupContent);

                const winnerPercentage = parseFloat(electionResult[electionResult.Winner] || 0) * 100;

                const originalStyle = {
                    fillColor: getColor(electionResult.Winner, winnerPercentage),
                    fillOpacity: 0.7,
                    color: '#000',
                    weight: 1
                };

                featureLayer.setStyle(originalStyle);
                featureLayer.options.originalStyle = originalStyle; // Store the original style
            } else {
                console.log(`No match found for ID: ${id}`); // Log if no match is found
            }
        });
    }

    function getColor(winner, percentage) {
        if (!winner || percentage === 0) {
            console.log(`getColor called with undefined winner or percentage`); // Log if winner is undefined
            return '#7f7f7f'; // Grey for unknown
        }

        console.log(`getColor called with: ${winner}, percentage: ${percentage}`); // Log the winner value and percentage

        let baseColor;
        switch (winner.trim().toUpperCase()) {
            case 'ENS': baseColor = '#F6B000'; break; // Yellow
            case 'NFP': baseColor = '#FF4A52'; break; // Red
            case 'RN': baseColor = '#004A77'; break; // Blue
            case 'UDC': baseColor = '#71BBDE'; break; // Light Blue
            case 'REC': baseColor = '#0D0D0D'; break; // Purple
            case 'ECO': baseColor = '#25DB96'; break; // Brown
            case 'DSV': baseColor = '#0089DE'; break; // Medium Slate Blue
            case 'RDG': baseColor = '#E6CB00'; break; // Orchid
            case 'DXG': baseColor = '#932929'; break; // Tomato
            case 'DVG': baseColor = '#D9116B'; break; // Gold
            case 'DVC': baseColor = '#E6CB00'; break; // Medium Spring Green
            case 'DVD': baseColor = '#4D49F1'; break; // Steel Blue
            case 'REG': baseColor = '#DCBDA0'; break; // Dark Red
            case 'DIV': baseColor = '#808080'; break; // Grey
            default: return '#7f7f7f'; // Grey for others
        }

        // Darken the color based on the percentage (higher percentage -> darker color)
        const colorIntensity = Math.min(1, percentage / 50); // assuming percentage is a fraction (0.0 - 100.0)
        return d3.interpolateLab('#ffffff', baseColor)(colorIntensity); // interpolate between white and baseColor
    }

    function filterMap(party) {
        if (geojsonLayer && electionData) {
            geojsonLayer.eachLayer(layer => {
                const feature = layer.feature;
                const id = feature.properties.REF?.trim().toLowerCase();
                const electionResult = electionData.find(d => d.ID.trim().toLowerCase() === id);
    
                if (electionResult) {
                    const winner = electionResult.Winner.trim().toUpperCase();
                    const originalStyle = {
                        fillColor: getColor(winner, parseFloat(electionResult[winner]) * 100),
                        fillOpacity: 0.7,
                        color: '#000',
                        weight: 1
                    };
    
                    if (party === 'all' || winner === party) {
                        layer.setStyle(originalStyle);
                    } else {
                        layer.setStyle({ fillOpacity: 0 });
                    }
                    
                    layer.options.originalStyle = originalStyle; // Ensure original style is stored
                }
            });
        }
    }
    
    

    document.getElementById('partySelect').addEventListener('change', (event) => {
        const selectedParty = event.target.value;
        filterMap(selectedParty);
    });

    function onEachFeature(feature, layer) {
        layer.on({
            mouseover: highlightFeature,
            mouseout: resetHighlight,
            click: zoomToFeature
        });
    }

    function highlightFeature(e) {
        const layer = e.target;
    
        const party = document.getElementById('partySelect').value;
        const feature = layer.feature;
        const id = feature.properties.REF?.trim().toLowerCase();
        const electionResult = electionData.find(d => d.ID.trim().toLowerCase() === id);
    
        if (electionResult && (party === 'all' || electionResult.Winner.trim().toUpperCase() === party)) {
            layer.setStyle({
                weight: 3,
                color: '#666',
                dashArray: '',
                fillOpacity: 0.7
            });
    
            if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
                layer.bringToFront();
            }
    
            const popupContent = layer.getPopup().getContent();
            updateTooltipContent(popupContent);
        }
    }
    
    function resetHighlight(e) {
        const layer = e.target;
        const party = document.getElementById('partySelect').value;
        const feature = layer.feature;
        const id = feature.properties.REF?.trim().toLowerCase();
        const electionResult = electionData.find(d => d.ID.trim().toLowerCase() === id);
    
        if (electionResult) {
            const winner = electionResult.Winner.trim().toUpperCase();
            if (party === 'all' || winner === party) {
                layer.setStyle(layer.options.originalStyle); // Reapply the original style
            } else {
                layer.setStyle({ fillOpacity: 0 }); // Keep it hidden if it doesn't match the filter
            }
            updateTooltipContent('<h4>Hover over a region</h4>');
        }
    }
    

    function zoomToFeature(e) {
        map.fitBounds(e.target.getBounds());
    }

    loadShapefile('France Data/france-shapefile.zip', map, layer => {
        loadExcelData('France Data/france-results.xlsx', data => {
            integrateData(layer, data);
            geojsonLayer = layer;
        });
    });
});

