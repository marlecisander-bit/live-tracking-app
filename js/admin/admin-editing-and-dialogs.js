(function() {
    function selectedLayer() { return window.adminMapData.selectedLayer; }
    function selectedProperties() { return selectedLayer() ? adminFeatureProperties(selectedLayer()) : null; }

    function showStickerPreview(value) {
        const preview = document.getElementById('poi-sticker-preview');
        if (!preview) return;
        preview.innerHTML = '';
        if (!value) {
            const empty = document.createElement('span');
            empty.textContent = 'No sticker';
            preview.appendChild(empty);
            return;
        }
        const image = document.createElement('img');
        image.src = value;
        image.alt = 'Selected POI sticker';
        preview.appendChild(image);
    }

    function removeStickerBackground(context, width, height) {
        const imageData = context.getImageData(0, 0, width, height);
        const pixels = imageData.data;
        const pixelCount = width * height;
        let transparentPixels = 0;
        for (let offset = 3; offset < pixels.length; offset += 4) {
            if (pixels[offset] < 245) transparentPixels += 1;
        }

        // Do not damage artwork that already has a transparent background.
        if (transparentPixels > pixelCount * 0.01) return false;

        const borderSamples = [];
        const sample = function(x, y) {
            const offset = (y * width + x) * 4;
            borderSamples.push([pixels[offset], pixels[offset + 1], pixels[offset + 2]]);
        };
        const stepX = Math.max(1, Math.floor(width / 80));
        const stepY = Math.max(1, Math.floor(height / 80));
        for (let x = 0; x < width; x += stepX) {
            sample(x, 0);
            if (height > 1) sample(x, height - 1);
        }
        for (let y = 1; y < height - 1; y += stepY) {
            sample(0, y);
            if (width > 1) sample(width - 1, y);
        }
        const medianChannel = function(channel) {
            const values = borderSamples.map(function(color) { return color[channel]; })
                .sort(function(a, b) { return a - b; });
            return values[Math.floor(values.length / 2)];
        };
        const background = [medianChannel(0), medianChannel(1), medianChannel(2)];
        const colorDistance = function(pixelIndex) {
            const offset = pixelIndex * 4;
            const red = pixels[offset] - background[0];
            const green = pixels[offset + 1] - background[1];
            const blue = pixels[offset + 2] - background[2];
            return Math.sqrt(red * red + green * green + blue * blue);
        };

        const visited = new Uint8Array(pixelCount);
        const queue = new Int32Array(pixelCount);
        let head = 0;
        let tail = 0;
        const addBackgroundPixel = function(index) {
            if (visited[index] || colorDistance(index) > 72) return;
            visited[index] = 1;
            queue[tail] = index;
            tail += 1;
        };
        for (let x = 0; x < width; x += 1) {
            addBackgroundPixel(x);
            if (height > 1) addBackgroundPixel((height - 1) * width + x);
        }
        for (let y = 1; y < height - 1; y += 1) {
            addBackgroundPixel(y * width);
            if (width > 1) addBackgroundPixel(y * width + width - 1);
        }
        while (head < tail) {
            const index = queue[head];
            head += 1;
            const x = index % width;
            const y = Math.floor(index / width);
            if (x > 0) addBackgroundPixel(index - 1);
            if (x + 1 < width) addBackgroundPixel(index + 1);
            if (y > 0) addBackgroundPixel(index - width);
            if (y + 1 < height) addBackgroundPixel(index + width);
        }

        for (let index = 0; index < pixelCount; index += 1) {
            if (!visited[index]) continue;
            const edgeOpacity = Math.max(0, Math.min(1, (colorDistance(index) - 24) / 48));
            pixels[index * 4 + 3] = Math.round(pixels[index * 4 + 3] * edgeOpacity);
        }
        context.putImageData(imageData, 0, 0);
        return true;
    }

    function normalizeStickerFile(file) {
        return new Promise(function(resolve, reject) {
            const sourceUrl = URL.createObjectURL(file);
            const image = new Image();
            image.onload = function() {
                try {
                    if (
                        !image.naturalWidth ||
                        !image.naturalHeight ||
                        image.naturalWidth > 4096 ||
                        image.naturalHeight > 4096 ||
                        image.naturalWidth * image.naturalHeight > 16000000
                    ) {
                        throw new Error('Sticker dimensions must be no larger than 4096 × 4096');
                    }
                    const sourceCanvas = document.createElement('canvas');
                    sourceCanvas.width = image.naturalWidth;
                    sourceCanvas.height = image.naturalHeight;
                    const sourceContext = sourceCanvas.getContext('2d', { willReadFrequently: true });
                    sourceContext.drawImage(image, 0, 0);
                    const backgroundRemoved = removeStickerBackground(
                        sourceContext,
                        sourceCanvas.width,
                        sourceCanvas.height
                    );
                    const pixels = sourceContext.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height).data;
                    let left = sourceCanvas.width, top = sourceCanvas.height, right = -1, bottom = -1;

                    for (let y = 0; y < sourceCanvas.height; y += 1) {
                        for (let x = 0; x < sourceCanvas.width; x += 1) {
                            if (pixels[(y * sourceCanvas.width + x) * 4 + 3] > 8) {
                                if (x < left) left = x;
                                if (x > right) right = x;
                                if (y < top) top = y;
                                if (y > bottom) bottom = y;
                            }
                        }
                    }

                    if (right < left || bottom < top) throw new Error('The sticker is fully transparent');
                    const cropWidth = right - left + 1;
                    const cropHeight = bottom - top + 1;
                    const outputSize = 128;
                    const artworkSize = 112;
                    const scale = Math.min(artworkSize / cropWidth, artworkSize / cropHeight);
                    const drawWidth = Math.max(1, Math.round(cropWidth * scale));
                    const drawHeight = Math.max(1, Math.round(cropHeight * scale));
                    const outputCanvas = document.createElement('canvas');
                    outputCanvas.width = outputSize;
                    outputCanvas.height = outputSize;
                    const outputContext = outputCanvas.getContext('2d');
                    outputContext.imageSmoothingEnabled = true;
                    outputContext.imageSmoothingQuality = 'high';
                    outputContext.drawImage(
                        sourceCanvas,
                        left, top, cropWidth, cropHeight,
                        Math.round((outputSize - drawWidth) / 2),
                        Math.round((outputSize - drawHeight) / 2),
                        drawWidth, drawHeight
                    );
                    resolve({
                        sticker: outputCanvas.toDataURL('image/png'),
                        backgroundRemoved: backgroundRemoved
                    });
                } catch (error) {
                    reject(error);
                } finally {
                    URL.revokeObjectURL(sourceUrl);
                }
            };
            image.onerror = function() {
                URL.revokeObjectURL(sourceUrl);
                reject(new Error('The image could not be opened'));
            };
            image.src = sourceUrl;
        });
    }

    function stopMovingPoint(layer, saveChange) {
        if (!layer || !(layer instanceof L.Marker)) return;
        if (layer.dragging && layer.dragging.enabled()) layer.dragging.disable();
        if (layer.pm && layer.pm.layerDragEnabled && layer.pm.layerDragEnabled()) {
            layer.pm.disableLayerDrag();
        }
        const button = document.getElementById('move-point-button');
        if (button) button.textContent = 'Move Stop on Map';
        if (saveChange) {
            adminMarkChanged();
            window.app.helpers.showToast('New stop location saved in the draft');
        }
    }

    function startPoint(type) {
        const map = adminGetMap();
        if (!map || !map.pm) return false;
        window.app.setCurrentPointType(type);
        map.pm.enableDraw('Marker', { snappable: true });
        window.app.helpers.showToast('Click the map to place the ' + (type === 'poi' ? 'POI' : 'stop'));
        return true;
    }

    const actions = {
        startAddStop: function() { return startPoint('stop'); },
        startAddPOI: function() { return startPoint('poi'); },
        startDrawRoute: function() {
            const map = adminGetMap();
            if (!map || !map.pm) return false;
            window.app.setCurrentPointType('route');
            map.pm.enableDraw('Line', { snappable: true, snapDistance: 12, pathOptions: { color: '#d90000', weight: 6 } });
            window.app.helpers.showToast('Click the map to draw the route; click Finish when done');
            return true;
        },
        startAutoRoute: function() {
            const editor = document.getElementById('auto-route-builder');
            if (editor) editor.scrollIntoView({ behavior: 'smooth', block: 'start' });
            if (!selectedLayer()) window.app.helpers.showToast('Select or draw a route first');
        },
        updatePointForm: function() {
            const isPoi = document.getElementById('point-type').value === 'poi';
            document.getElementById('stop-number-group').style.display = isPoi ? 'none' : 'block';
            document.getElementById('poi-category-group').style.display = isPoi ? 'block' : 'none';
            document.getElementById('poi-sticker-group').style.display = isPoi ? 'block' : 'none';
            document.getElementById('poi-source-group').style.display = isPoi ? 'block' : 'none';
            document.getElementById('point-editor-title').textContent = isPoi ? 'Edit POI' : 'Edit Stop';
            const moveButton = document.getElementById('move-point-button');
            if (moveButton) {
                moveButton.style.display = isPoi ? 'none' : 'block';
                moveButton.textContent = 'Move Stop on Map';
            }
        },
        choosePOISticker: function() {
            const input = document.getElementById('poi-sticker-file');
            if (input) input.click();
        },
        handlePOIStickerFile: async function(event) {
            const input = event && event.target ? event.target : document.getElementById('poi-sticker-file');
            const file = input && input.files && input.files[0];
            if (!file) return;
            if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
                input.value = '';
                return window.app.helpers.showToast('Choose a PNG, JPEG, or WebP image');
            }
            if (file.size > 4 * 1024 * 1024) {
                input.value = '';
                return window.app.helpers.showToast('Source image must be smaller than 4 MB');
            }
            try {
                const result = await normalizeStickerFile(file);
                if (result.sticker.length > 200 * 1024) {
                    throw new Error('The standardized sticker is too complex; use a simpler PNG');
                }
                input.dataset.sticker = result.sticker;
                showStickerPreview(input.dataset.sticker);
                window.app.helpers.showToast(result.backgroundRemoved
                    ? 'Background removed and object prepared for the map'
                    : 'Transparent object prepared for the map');
            } catch (error) {
                input.value = '';
                window.app.helpers.showToast(error && error.message ? error.message : 'The sticker could not be processed');
            }
        },
        removePOISticker: function() {
            const input = document.getElementById('poi-sticker-file');
            if (input) {
                input.value = '';
                input.dataset.sticker = '';
            }
            showStickerPreview('');
        },
        toggleMoveSelectedPoint: function() {
            const layer = selectedLayer();
            const properties = selectedProperties();
            if (!layer || !(layer instanceof L.Marker) || !properties) {
                return window.app.helpers.showToast('Select an existing stop first');
            }
            if (properties.pointType !== 'stop') {
                return window.app.helpers.showToast('This option is available for stops');
            }

            const isMoving = Boolean(
                (layer.dragging && layer.dragging.enabled()) ||
                (layer.pm && layer.pm.layerDragEnabled && layer.pm.layerDragEnabled())
            );

            if (isMoving) {
                stopMovingPoint(layer, true);
                return true;
            }

            if (layer.dragging) {
                layer.dragging.enable();
            } else if (layer.pm && layer.pm.enableLayerDrag) {
                layer.pm.enableLayerDrag();
            } else {
                return window.app.helpers.showToast('Map dragging is unavailable');
            }

            const button = document.getElementById('move-point-button');
            if (button) button.textContent = 'Finish Moving Stop';
            window.app.helpers.showToast('Drag the stop marker, then click Finish Moving Stop');
            return true;
        },
        savePointObject: async function() {
            const layer = selectedLayer();
            if (!layer || !(layer instanceof L.Marker)) return window.app.helpers.showToast('Select a stop or POI first');
            stopMovingPoint(layer, false);
            const p = selectedProperties();
            p.objectId = p.objectId || ('point-' + Date.now());
            p.objectType = 'point';
            p.pointType = document.getElementById('point-type').value;
            p.name = document.getElementById('point-name').value.trim();
            p.stopNumber = Number(document.getElementById('stop-number').value) || null;
            p.category = document.getElementById('poi-category').value;
            p.sticker = p.pointType === 'poi' ? (document.getElementById('poi-sticker-file').dataset.sticker || '') : '';
            p.visitTime = Number(document.getElementById('visit-time').value) || 0;
            p.description = document.getElementById('point-description').value.trim();
            p.active = document.getElementById('point-active').checked;
            layer.setIcon(adminPointIcon(p));
            adminMarkChanged();
            adminRefreshLists();
            if (window.app.actions && typeof window.app.actions.saveDraft === 'function') {
                const saved = await window.app.actions.saveDraft();
                if (!saved) return null;
                window.app.helpers.showToast(p.pointType === 'poi' ? 'POI saved to the draft' : 'Stop saved to the draft');
                return saved;
            }
            window.app.helpers.showToast('Object saved locally; use Save Draft to persist it');
            return p;
        },
        saveRouteObject: function() {
            const layer = selectedLayer();
            if (!layer || layer instanceof L.Marker) return window.app.helpers.showToast('Select a route first');
            const p = selectedProperties();
            p.objectId = p.objectId || ('route-' + Date.now());
            p.objectType = 'route';
            p.name = document.getElementById('route-name').value.trim() || 'Sightseeing Shkodra Route';
            p.color = document.getElementById('route-color').value;
            p.weight = Number(document.getElementById('route-weight').value) || 6;
            p.lineStyle = document.getElementById('route-style').value;
            p.directionMode = document.getElementById('route-direction').value;
            p.active = document.getElementById('route-active').checked;
            layer.setStyle(adminRouteStyle(p));
            adminMarkChanged();
            adminRefreshLists();
            window.app.helpers.showToast('Route saved');
        },
        deleteSelectedObject: function() {
            const layer = selectedLayer();
            if (!layer || !window.adminMapData.layerGroup) return;
            if (!window.confirm('Delete this object from the draft?')) return;
            adminSetLayerSelected(layer, false);
            window.adminMapData.layerGroup.removeLayer(layer);
            actions.closeEditor();
            adminMarkChanged();
            adminRefreshLists();
        },
        closeEditor: function() {
            const layer = selectedLayer();
            stopMovingPoint(layer, false);
            if (layer) adminSetLayerSelected(layer, false);
            document.getElementById('point-editor').style.display = 'none';
            document.getElementById('route-editor').style.display = 'none';
            const workspace = document.getElementById('workspace');
            if (workspace) workspace.classList.remove('editor-open');
            window.adminMapData.selectedLayer = null;
        },
        addStopToSequence: function() {
            const p = selectedProperties();
            if (!p || selectedLayer() instanceof L.Marker) return window.app.helpers.showToast('Select a route first');
            const id = document.getElementById('sequence-stop-select').value;
            if (!id) return;
            p.stopSequence = Array.isArray(p.stopSequence) ? p.stopSequence : [];
            p.stopSequence.push(id);
            adminRenderStopSequence(p.stopSequence);
            adminMarkChanged();
        },
        autoBuildSequence: function() {
            const p = selectedProperties();
            if (!p || selectedLayer() instanceof L.Marker) return window.app.helpers.showToast('Select a route first');
            p.stopSequence = adminGetAllStops().sort(function(a, b) {
                return Number(adminFeatureProperties(a).stopNumber) - Number(adminFeatureProperties(b).stopNumber);
            }).map(function(layer) { return adminFeatureProperties(layer).objectId; });
            adminRenderStopSequence(p.stopSequence);
            adminMarkChanged();
        },
        clearAutoRouteViaPoints: function() {
            const p = selectedProperties();
            if (p) p.autoRouteViaPoints = {};
            document.getElementById('auto-route-waypoint-list').innerHTML = '';
            adminMarkChanged();
        },
        undoAutoRouteViaPoint: function() {
            window.app.helpers.showToast('Select the route and edit its vertices directly on the map');
        },
        enableAutoRouteViaMode: function() {
            window.app.helpers.showToast('Via-point mode is not required; drag route vertices with the edit tool');
        },
        generateAutoRouteFromStopOrder: async function() {
            const layer = selectedLayer();
            const p = selectedProperties();
            if (!layer || layer instanceof L.Marker || !p) return window.app.helpers.showToast('Select a route first');
            const sequence = Array.isArray(p.stopSequence) ? p.stopSequence.slice() : [];
            if (sequence.length < 2) return window.app.helpers.showToast('Add at least two stops to the Stop Order');
            const stops = adminGetAllStops();
            const points = sequence.map(function(id) {
                return stops.find(function(stop) { return adminFeatureProperties(stop).objectId === id; });
            }).filter(Boolean).map(function(stop) { return stop.getLatLng(); });
            if (points.length < 2) return window.app.helpers.showToast('The stops in this sequence could not be found');
            if (document.getElementById('auto-route-close-loop').checked && !points[0].equals(points[points.length - 1])) points.push(points[0]);
            const status = document.getElementById('auto-route-status');
            status.textContent = 'Calculating the road route...';
            const coordinates = points.map(function(point) { return point.lng + ',' + point.lat; }).join(';');
            try {
                const response = await fetch('https://router.project-osrm.org/route/v1/driving/' + coordinates + '?overview=full&geometries=geojson');
                const result = await response.json();
                if (!response.ok || !result.routes || !result.routes.length) throw new Error('No road route found');
                layer.setLatLngs(result.routes[0].geometry.coordinates.map(function(point) { return [point[1], point[0]]; }));
                p.routeDistanceKm = result.routes[0].distance / 1000;
                status.textContent = 'Road route generated successfully.';
                adminMarkChanged();
                adminGetMap().fitBounds(layer.getBounds(), { padding: [40, 40] });
            } catch (error) {
                console.error(error);
                status.textContent = 'Road routing is temporarily unavailable. You can still edit the line manually.';
            }
        },
        openPOIManager: function() { document.getElementById('poi-manager-modal').style.display = 'flex'; },
        closePOIManager: function() { document.getElementById('poi-manager-modal').style.display = 'none'; },
        openExportMapModal: function() { document.getElementById('export-map-modal').classList.add('open'); },
        closeExportMapModal: function() { document.getElementById('export-map-modal').classList.remove('open'); },
        previewPublicMap: function() { window.open('live-map.html?project=' + encodeURIComponent(window.appConfig.projectSlug || window.appConfig.defaultProjectSlug), '_blank'); },
        getAllStops: adminGetAllStops,
        prepareMapData: adminBuildFeatureCollection
    };

    window.app.registerActionGroup('adminEditing', actions);
})();
