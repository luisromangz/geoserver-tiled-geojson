L.TileLayer.TileJSON = L.TileLayer.Canvas.extend({
    options: {
        id: null,
        debug: false,
        reloadOnUpdate: false,
        enableOffset: true,
        request: {

        }
    },

    includes: [L.CanvasRenderer],
    tree: null,
    tileSize: 256,
 
    initialize: function (options) {
        L.Util.setOptions(this, options);

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

        this._map = map;

        map.on("click", function(e) {            
            this._onClick(e);
        },this);

        map.on("dragstart",function(){this.dragging=true;},this);
        map.on("dragend",function(){this.dragging=false;},this);
    },

    getMap :function() {
        return this._map;
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

                self._requestAnimationFrame(function(){
                    self._drawTileFeatures(data.features, ctx);    
                });               

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

    _drawTileFeatures: function(features, ctx, skipTree) {
        this._drawFeatures(features, ctx);

        for (i = 0; i < features.length; i++) {
            var feature = features[i];

            // We store the retrieved features in a search tree.
            if (!skipTree) {
                var treeNode = this._createTreeData(feature, ctx.tile);
                this.tree.insert(treeNode);
            }
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
                    if(tile) {
                        this._loadTile(tile, featureTilePoint);    
                    } else {
                        this._addTile(featureTilePoint, this._tileContainer);
                    }
                    
                } else if(this._map) { // If we removed the layer we don't want updates.

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
                                if(feature.hasOwnProperty(field)){
                                    existingFeature[field] = feature[field];    
                                }
                                
                            }

                            existingFeature._dirty = true;
                        }

                       // existingFeature.properties.color = this.dragging?"green":"blue";
                        updatedFeatures.push(existingFeature);    
                    }

                    if(!this.dragging) {
                        // To prevent redraws while dragging.
                        this._drawTileFeatures(updatedFeatures, ctx,true);
                    } else {
                        this._map.addOneTimeEventListener("dragend", function() {
                            this._drawTileFeatures(updatedFeatures, ctx,true);
                        },this)
                    }
                    
                }
            }
        }

    },
 
    // NOTE: a placeholder for a function that, given a tile context, returns a string to a GeoJSON service that retrieve features for that context
    createRequest: function (bounds,ctx) {
        // override with your code
    }
});