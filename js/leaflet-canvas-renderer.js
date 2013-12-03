if (typeof(L) !== 'undefined') {

	L.CanvasRenderer = {

		_requestAnimationFrameFn : null,

		getMap : function() {
			throw new Error("getMap function must be overriden in implementing class!");
		},

		_requestAnimationFrame : function(callback) {
			if(!this._requestAnimationFrameFn) {
				this._requestAnimationFrameFn =  requestAnimationFrame = window.requestAnimationFrame || window.mozRequestAnimationFrame ||
                                window.webkitRequestAnimationFrame || window.msRequestAnimationFrame;
			}

			this._requestAnimationFrameFn.call(window, callback);
		},

		_drawFeatures: function(features, ctx) {

			console.time("drawFeatures");

			if(!this.getMap()) {
				// The layer is invisible, we do nothing.
				return;
			}


			var i;

			// we clean the canvas...
			if (ctx.canvas) {
				var g = ctx.canvas.getContext('2d');
				g.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
			}

			// We generate styles and store the features with their associated styles
			// and index.        
			var zBuffer = [];
			for (i = 0; i < features.length; i++) {
				var feature = features[i];

				var style = this.styleFor(feature);
				zBuffer.push({
					style: style,
					zIndex: !! style.zIndex ? style.zIndex : 0,
					feature: feature
				});
			}

			// We use the zIndex to order the features        
			zBuffer.sort(function(f1, f2) {
				return f1.zIndex - f2.zIndex;
			});

			for (i = 0; i < zBuffer.length; i++) {
				var oFeature = zBuffer[i];
				this._drawFeature(oFeature.feature, oFeature.style, ctx);
			}

			console.timeEnd("drawFeatures");
			console.debug(zBuffer.length+" features");
		},

		_drawPoint: function(ctx, geom, style, properties) {
			if (!style) {
				return;
			}
			var p = this._canvasPoint(ctx, geom);
			var c = ctx.canvas;
			var g = c.getContext('2d');
			g.beginPath();
			g.fillStyle = style.color;
			g.arc(p.x, p.y, style.radius, 0, Math.PI * 2);
			g.closePath();
			g.fill();
			g.restore();
		},

		_drawLineString: function(ctx, geom, style) {
			if (!style) {
				return;
			}

			var coords = geom,
				proj = [],
				i;
			coords = this._clip(ctx, coords);

			for (i = 0; i < coords.length; i++) {
				proj.push(this._canvasPoint(ctx, coords[i]));
			}

			proj = L.LineUtil.simplify(proj, 3);

			if (!this._isActuallyVisible(proj)) {
				return;
			}

			var offset = style.offset;
			if (!this.options.enableOffset || !offset) {
				offset = 0;
			}
			if (offset !== 0) {
				for (var j = 0; j < proj.length; j++) {

					var p = proj[j];

					if (j === 0) {
						nextPoint = proj[j + 1];
						normal = this._calculateNormal(p, nextPoint);
						p.x = p.x + offset * normal.x;
						p.y = p.y + offset * normal.y;
					} else if (j == proj.length - 1) {
						prevPoint = proj[j - 1];
						normal = this._calculateNormal(prevPoint, p);
						p.x = p.x + offset * normal.x;
						p.y = p.y + offset * normal.y;
					} else {

						prevPoint = proj[j - 1];
						normal0 = this._calculateNormal(prevPoint, p);

						var x1 = prevPoint.x + offset * normal0.x;
						var y1 = prevPoint.y + offset * normal0.y;

						var x2 = p.x + offset * normal0.x;
						var y2 = p.y + offset * normal0.y;

						nextPoint = nextPoint = proj[j + 1];
						normal1 = this._calculateNormal(p, nextPoint);
						var x3 = p.x + offset * normal1.x;
						var y3 = p.y + offset * normal1.y;

						var x4 = nextPoint.x + offset * normal1.x;
						var y4 = nextPoint.y + offset * normal1.y;


						var d = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);

						if (d < 0.000000000001) {
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

		_calculateNormal: function(p0, p1) {
			var ry = p1.y - p0.y;
			var rx = p1.x - p0.x;

			var d = Math.sqrt(rx * rx + ry * ry);

			return {
				x: -ry / d,
				y: rx / d
			};
		},

		_drawPolygon: function(ctx, geom, style) {
			if (!style) {
				return;
			}

			for (var el = 0; el < geom.length; el++) {
				var coords = geom[el],
					proj = [],
					i;
				coords = this._clip(ctx, coords);
				for (i = 0; i < coords.length; i++) {
					proj.push(this._canvasPoint(ctx, coords[i]));
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

		_clip: function(ctx, points) {
			var nw;
			if (ctx.tile) {
				nw = ctx.tile.multiplyBy(this.tileSize);
			} else {
				nw = new L.Point(0, 0);
			}
			var se = nw.add(new L.Point(ctx.canvas.width, ctx.canvas.height));
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

		_canvasPoint: function(ctx, coords) {
			// start coords to tile 'space'
			if (!ctx.s) {
				if (ctx.tile) {
					ctx.s = ctx.tile.multiplyBy(ctx.canvas.width);
				} else {
					//ctx.s = new L.Point(0, 0);
					ctx.s = this.getMap().getPixelBounds().min;
				}
			}

			// actual coords to tile 'space'
			var p = this.getMap().project(new L.LatLng(coords[1], coords[0]));
			// var p = this._map.options.crs.latLngToPoint({
			// 	lat: coords[1],
			// 	lng: coords[0]
			// }, ctx.zoom);

			// point to draw        
			var x = Math.round(p.x - ctx.s.x);
			var y = Math.round(p.y - ctx.s.y);
			return {
				x: x,
				y: y
			};
		},


		_isActuallyVisible: function(coords) {
			var coord = coords[0];
			var min = [coord.x, coord.y],
				max = [coord.x, coord.y];
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


		// NOTE: a placeholder for a function that, given a feature, returns a style object used to render the feature itself
		styleFor: function(feature) {
			// override with your code
			throw new Error("styleFor function must be overriden in implementing class!");
		}
	}
}