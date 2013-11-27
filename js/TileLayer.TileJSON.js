L.TileLayer.TileJSON = L.TileLayer.Canvas.extend({
    options: {
        id: null,
        debug: false,
        reloadOnUpdate: true,
        request: {

        }
    },

    layerCounter: 0,
    tree: null,
    tileSize: 256,
 
    initialize: function (options) {
        L.Util.setOptions(this, options);

        L.TileLayer.TileJSON.prototype.layerCounter++;

        this.drawTile = function (canvas, tilePoint, zoom) {
            var ctx = {
                canvas: canvas,
                tile: tilePoint,
                zoom: this._getZoomForUrl() // fix for https://github.com/CloudMade/Leaflet/pull/993
            };

            if(this.tree===null || this.lastZoom!=zoom) {
                this.tree = rbush(9, ['.minx', '.miny', '.maxx', '.maxy']);
                this.lastZoom = zoom;
            }
 
            if (this.options.debug) {
                this._drawDebugInfo(ctx);
            }

            this._draw(ctx);
        };
    },

    onAdd: function (map) {

        L.TileLayer.Canvas.prototype.onAdd.call(this, map);

        map.on("click", function(e) {            
            this._onClick(e);                            
        },this);
    },

    _drawDebugInfo: function (ctx) {
        var max = this.tileSize;
        var g = ctx.canvas.getContext('2d');
        g.strokeStyle = '#000000';
        g.fillStyle = '#FFFF00';
        g.strokeRect(0, 0, max, max);
        g.font = "12px Arial";
        g.fillRect(0, 0, 5, 5);
        g.fillRect(0, max - 5, 5, 5);
        g.fillRect(max - 5, 0, 5, 5);
        g.fillRect(max - 5, max - 5, 5, 5);
        g.fillRect(max / 2 - 5, max / 2 - 5, 10, 10);
        g.strokeText(ctx.tile.x + ' ' + ctx.tile.y + ' ' + ctx.zoom, max / 2 - 30, max / 2 - 10);
    },
 
    _tilePoint: function (ctx, coords) {
        // start coords to tile 'space'
        var s = ctx.tile.multiplyBy(this.tileSize);
 
        // actual coords to tile 'space'
        var p = this._map.project(new L.LatLng(coords[1], coords[0]));
 
        // point to draw        
        var x = Math.round(p.x - s.x);
        var y = Math.round(p.y - s.y);
        return {
            x: x,
            y: y
        };
    },
 
    _clip: function (ctx, points) {
        var nw = ctx.tile.multiplyBy(this.tileSize);
        var se = nw.add(new L.Point(this.tileSize, this.tileSize));
        var bounds = new L.Bounds([nw, se]);
        var len = points.length;
        var out = [];
 
        for (var i = 0; i < len - 1; i++) {
            var seg = L.LineUtil.clipSegment(points[i], points[i + 1], bounds, i);
            if (!seg) {
                continue;
            }
            out.push(seg[0]);
            // if segment goes out of screen, or it's the last one, it's the end of the line part
            if ((seg[1] !== points[i + 1]) || (i === len - 2)) {
                out.push(seg[1]);
            }
        }
        return out;
    },
 
    _isActuallyVisible: function (coords) {
        var coord = coords[0];
        var min = [coord.x, coord.y], max = [coord.x, coord.y];
        for (var i = 1; i < coords.length; i++) {
            coord = coords[i];
            min[0] = Math.min(min[0], coord.x);
            min[1] = Math.min(min[1], coord.y);
            max[0] = Math.max(max[0], coord.x);
            max[1] = Math.max(max[1], coord.y);
        }
        var diff0 = max[0] - min[0];
        var diff1 = max[1] - min[1];
        if (this.options.debug) {
            console.log(diff0 + ' ' + diff1);
        }
        var visible = diff0 > 1 || diff1 > 1;
        return visible;
    },

    _drawPoint: function (ctx, geom, style, properties) {
        if (!style) {
            return;
        }
        var p = this._tilePoint(ctx, geom);
        var c = ctx.canvas;
        var g = c.getContext('2d');
        g.beginPath();
        g.fillStyle = style.color;
        g.arc(p.x, p.y, style.radius, 0, Math.PI * 2);
        g.closePath();
        g.fill();
        g.restore();
    },
 
    _drawLineString: function (ctx, geom, style) {
        if (!style) {
            return;
        }
        
        var coords = geom, proj = [], i;
        coords = this._clip(ctx, coords);
       
        for (i = 0; i < coords.length; i++) {
            proj.push(this._tilePoint(ctx, coords[i]));
        }


        proj = L.LineUtil.simplify(proj, 2);

        var offset = style.offset;
        if(!offset) {
            offset =0;
        }
        if (offset !== 0) {
            for(var j=0; j < proj.length; j++) {

                var p = proj[j];

                if (j === 0) {
                    nextPoint = proj[j+1];
                    normal = this._calculateNormal(p, nextPoint);
                    p.x = p.x + offset * normal.x;
                    p.y = p.y + offset * normal.y;
                } else if (j == proj.length - 1) {
                    prevPoint = proj[j - 1];
                    normal = this._calculateNormal(prevPoint, p);
                    p.x = p.x + offset * normal.x;
                    p.y = p.y + offset * normal.y;
                } else {

                    prevPoint =proj[j - 1];
                    normal0 = this._calculateNormal(prevPoint, p);

                    var x1 = prevPoint.x + offset * normal0.x;
                    var y1 = prevPoint.y + offset * normal0.y;

                    var x2 = p.x + offset * normal0.x;
                    var y2 = p.y + offset * normal0.y;

                    nextPoint = nextPoint = proj[j+1];
                    normal1 = this._calculateNormal(p, nextPoint);
                    var x3 = p.x + offset * normal1.x;
                    var y3 = p.y + offset * normal1.y;

                    var x4 = nextPoint.x + offset * normal1.x;
                    var y4 = nextPoint.y + offset * normal1.y;


                    var d = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);

                    if (d < 0.0000000000001) {
                        // Very small denominators make the calculation go crazy.
                        p.x = p.x + offset * normal.x;
                        p.y = p.y + offset * normal.y;
                    } else {
                        var n1 = (x1 * y2 - y1 * x2);
                        var n2 = (x3 * y4 - y3 * x4);

                        p.x = (n1 * (x3 - x4) - (x1 - x2) * n2) / d;
                        p.y = (n1 * (y3 - y4) - (y1 - y2) * n2) / d;
                    }
                }
            }

        }

        if (!this._isActuallyVisible(proj)) {
            return;
        }
 
        var g = ctx.canvas.getContext('2d');
        g.strokeStyle = style.color;
        g.lineWidth = style.size;
        g.beginPath();
        for (i = 0; i < proj.length; i++) {
            var method = (i === 0 ? 'move' : 'line') + 'To';
            g[method](proj[i].x, proj[i].y);
        }
        g.stroke();
        g.restore();
    },

    _calculateNormal: function (p0, p1) {
        var ry = p1.y - p0.y;
        var rx = p1.x - p0.x;

        var d = Math.sqrt(rx * rx + ry * ry);

        return {x:-ry / d, y:rx / d};
    },
 
    _drawPolygon: function (ctx, geom, style) {
        if (!style) {
            return;
        }
        
        for (var el = 0; el < geom.length; el++) {
            var coords = geom[el], proj = [], i;
            coords = this._clip(ctx, coords);
            for (i = 0; i < coords.length; i++) {
                proj.push(this._tilePoint(ctx, coords[i]));
            }
            if (!this._isActuallyVisible(proj)) {
                continue;
            }
 
            var g = ctx.canvas.getContext('2d');
            var outline = style.outline;
            g.fillStyle = style.color;
            if (outline) {
                g.strokeStyle = outline.color;
                g.lineWidth = outline.size;
            }
            g.beginPath();
            for (i = 0; i < proj.length; i++) {
                var method = (i === 0 ? 'move' : 'line') + 'To';
                g[method](proj[i].x, proj[i].y);
            }
            g.closePath();
            g.fill();
            if (outline) {
                g.stroke();
            }
        }
    },
 
    _draw: function (ctx) {
        // NOTE: this is the only part of the code that depends from external libraries (actually, jQuery only).        
        var loader = $.ajax;
 
        var bounds = this._tileBounds(ctx);
 
        var request = this.createRequest(bounds,ctx);
        var timerName = request.jsonpCallback+".requestFeatures."+ctx.tile.x+"/"+ctx.tile.y+"/"+ctx.zoom;
        console.time(timerName);

        var self = this;
        loader($.extend(request, {          
            success: function (data) {                
                console.timeEnd(timerName);

                timerName = request.jsonpCallback+".drawFeatures."+ctx.tile.x+"/"+ctx.tile.y+"/"+ctx.zoom;
                console.time(timerName);

                self._drawFeatures(data.features, ctx);

                console.timeEnd(timerName);

            }}, this.options.request));
    },

    _tileBounds: function(ctx) {
        var nwPoint = ctx.tile.multiplyBy(this.tileSize);
        var sePoint = nwPoint.add(new L.Point(this.tileSize, this.tileSize));
 
        // optionally, enlarge request area.
        // with this I can draw points with coords outside this tile area,
        // but with part of the graphics actually inside this tile.
        // NOTE: that you should use this option only if you're actually drawing points!
        var buf = this.options.buffer;
        if (buf > 0) {
            var diff = new L.Point(buf, buf);
            nwPoint = nwPoint.subtract(diff);
            sePoint = sePoint.add(diff);
        }
 
        var nwCoord = this._map.unproject(nwPoint, ctx.zoom, true);
        var seCoord = this._map.unproject(sePoint, ctx.zoom, true);
        return [nwCoord.lng, seCoord.lat, seCoord.lng, nwCoord.lat];
    },

    _drawFeatures: function(features, ctx, skipTree) {
        var i;

         // we clean the canvas...
        if(ctx.canvas) {
            var g = ctx.canvas.getContext('2d');     
            g.clearRect(0,0,ctx.canvas.width,ctx.canvas.height);    
        }
        

        // We generate styles and store the features with their associated styles
        // and index.
        var zBuffer = [];
        for (i = 0; i < features.length; i++) {
            var feature = features[i];

            // We store the retrieved features in a search tree.
            if(!skipTree) {
                var treeNode = this._createTreeData(feature,ctx.tile);
                this.tree.insert(treeNode);
            } 
            

            var style = this.styleFor(feature);

            zBuffer.push({
                style: style,
                zIndex: !!style.zIndex?style.zIndex:0,
                feature: feature
            });
        }

        // We use the zIndex to order the features
        zBuffer.sort(function(f1,f2) {
            return f1.zIndex - f2.zIndex;
        });

        for (i = 0; i < zBuffer.length; i++) {
            var oFeature = zBuffer[i];
            this._drawFeature(oFeature.feature, oFeature.style, ctx);
        }
    },

    _createTreeData: function(feature, tilePoint) {
        
        var bbox = this._featureBBox(feature);

        return {
            id: feature.properties.id,
            feature: feature,
            minx: bbox.min.x,
            maxx: bbox.max.x,
            miny: bbox.min.y,
            maxy: bbox.max.y,
            tilePoint: tilePoint
        };

    },

    _featureBBox: function(feature) {
        var points = [];
        var geom = feature.geometry.coordinates;
        var type = feature.geometry.type;
         switch (type) {
            case 'Point':
            case 'LineString':
            case 'Polygon':
                points = geom;
                break;

            case 'MultiPoint':
            case 'MultiLineString':
            case 'MultiPolygon':
                for(var j=0; j< geom.length;j++) {
                    points = points.concat(geom[j]);
                }
                break;

            default:
                throw new Error('Unmanaged type: ' + type);
        }

        return L.bounds(points);
    },

    _drawFeature: function(feature, style, ctx) {
        var type = feature.geometry.type;
        var geom = feature.geometry.coordinates;
        var len = geom.length;
        var j;
        switch (type) {
            case 'Point':
                this._drawPoint(ctx, geom, style, feature.properties);
                break;

            case 'MultiPoint':
                for (j = 0; j < len; j++) {
                    this._drawPoint(ctx, geom[j], style);
                }
                break;

            case 'LineString':
                this._drawLineString(ctx, geom, style);
                break;

            case 'MultiLineString':
                for (j = 0; j < len; j++) {
                    this._drawLineString(ctx, geom[j], style);
                }
                break;

            case 'Polygon':
                this._drawPolygon(ctx, geom, style);
                break;

            case 'MultiPolygon':
                for (j = 0; j < len; j++) {
                    this._drawPolygon(ctx, geom[j], style);
                }
                break;

            default:
                throw new Error('Unmanaged type: ' + type);
        }
    },

    _onClick: function(e) {
        var latLng = e.latlng;
        var result = this.tree.search([latLng.lng,latLng.lat,latLng.lng,latLng.lat]);

        var features = [];
        var ids = [];
        for(var i=0; i<result.length; i++) {
            var feature = result[i].feature;
            if(ids.indexOf(feature.properties.id)<0) {
                // TODO: Check that the feature was actually clicked
                features.push(result[i].feature); 
                ids.push(feature.properties.id);
            }
        }

        if(result.length>0) {
            this.fireEvent("featuresClicked", {
                clickEvent: e,
                features: features
            });
        }
    },

    updateFeature: function(feature) {
        // We retrieve the intersecting features, that must be redrawn.
        var bbox = this._featureBBox(feature);
        var intersectingFeatureNodes = this.tree.search([bbox.min.x,bbox.min.y,bbox.max.x,bbox.max.y]);

        // we determine the tiles to be redrawn from the features.
        var readdedTileKeys=[];
        for(var i=0; i < intersectingFeatureNodes.length; i++) {
            var featureTilePoint = intersectingFeatureNodes[i].tilePoint;
            var key=featureTilePoint.x+":"+featureTilePoint.y;

            if(readdedTileKeys.indexOf(key)<0) {

                readdedTileKeys.push(key);
                var tile = this._tiles[key];  
                if(this.options.reloadOnUpdate){                                     
                    this._loadTile(tile, featureTilePoint);
                } else {

                    var ctx = {
                        canvas: tile,
                        tile: featureTilePoint,
                        zoom: this._getZoomForUrl() // fix for https://github.com/CloudMade/Leaflet/pull/993
                    };


                    var tileFeatures = this.tree.search(this._tileBounds(ctx));
                    
                    var updatedFeatures = [];
                    for(var j=0; j< tileFeatures.length; j++ ){
                        var existingFeature = tileFeatures[j].feature;

                        if(existingFeature.properties.id == feature.properties.id) {
                            // We update the data!!!!
                            for(var field in feature) {
                                existingFeature[field] = feature[field];
                            }
                        }

                        updatedFeatures.push(existingFeature);    
                    }

                    this._drawFeatures(updatedFeatures, ctx, true);
                }
            }
        }

    },
 
    // NOTE: a placeholder for a function that, given a tile context, returns a string to a GeoJSON service that retrieve features for that context
    createRequest: function (bounds,ctx) {
        // override with your code
    },
 
    // NOTE: a placeholder for a function that, given a feature, returns a style object used to render the feature itself
    styleFor: function (feature) {
        // override with your code
    }
});