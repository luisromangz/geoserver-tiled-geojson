function initMap() {



	// Centered in Quito, Ecuador
	var map = L.map('map').setView([-0.2298500, -78.5249500], 8);
	L.tileLayer('http://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', {
		attribution: 'Map data &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors, <a href="http://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, Imagery © <a href="http://cloudmade.com">CloudMade</a>',
		maxZoom: 18
	}).addTo(map);

	var requests = 0;

	var higlightLayer = L.geoJson().addTo(map);

	var trafficLayer = new L.TileLayer.TileJSON({
		id: "traffic_layer",
		debug: false,
		// this value should be equal to 'radius' of your points        
		buffer: 5,
		reloadOnUpdate: false,
		request: {
			dataType: "jsonp",
			jsonp: false
		}
	});

	trafficLayer.createRequest = function(bounds) {
		requests++;

		var requestCallback = "parseRequest" + requests;
		var url = ['http://37.139.29.45:8080/geoserver/wfs?request=GetFeature&typeName=icm_traffic&outputFormat=text/javascript&srsName=EPSG:4326&format_options=callback:' + requestCallback + '&BBOX=',
			bounds[1], ',',
			bounds[0], ',',
			bounds[3], ',',
			bounds[2]
		].join('');
		return {
			url: url,
			jsonpCallback: requestCallback
		};
	};

	trafficLayer.styleFor = function(feature) {
		var type = feature.geometry.type;
		switch (type) {
			case 'Point':
			case 'MultiPoint':
				return {
					color: 'rgba(252,146,114,0.6)',
					radius: 5
				};

			case 'LineString':
			case 'MultiLineString':
				var lineStyle = {
					color: 'rgba(0,0,0,0.8)',
					size: 2
					
				};


				if (feature.properties.link_type_id == 33) {					
					lineStyle.color = 'rgba(255,0,0,0.8)';
					lineStyle.size = 3;					
					lineStyle.zIndex = 10;
					lineStyle.offset = 3;
				}

				if(feature.properties.clicked) {
					lineStyle.color = "rgba(0,0,255,0.8)";
					lineStyle.zIndex= 100;
					lineStyle.size = feature.properties.clicked;
				}

				if(feature.properties.color) {
					lineStyle.color = feature.properties.color;
				}

				return lineStyle;
			case 'Polygon':
			case 'MultiPolygon':
				return {
					color: 'rgba(43,140,190,0.4)',
					outline: {
						color: 'rgb(0,0,0)',
						size: 1
					}
				};

			default:
				return null;
		}
	};

	trafficLayer.addTo(map);
	trafficLayer.on("featuresClicked", function(e){
		var content = "";
		for(var i=0; i<e.features.length; i++) {
			var feature = e.features[i];
			content+="<p>"+JSON.stringify(feature.properties)+"</p>";		

			if(!feature.properties.clicked) {
				feature.properties.clicked=3;
			}

			feature.properties.clicked++;
			trafficLayer.updateFeature(feature);
		}
		//higlightLayer.addData(e.features);
		L.popup().setLatLng(e.clickEvent.latlng).setContent(content).openOn(map);
	});


	var geoJsonLayer = L.geoJson([], {
		style : function(feature) {
			var type = feature.geometry.type;
			switch (type) {
				case 'Point':
				case 'MultiPoint':
					return {
						color: 'rgba(252,146,114,0.6)',
						radius: 5
					};

				case 'LineString':
				case 'MultiLineString':
					if (feature.properties.link_type_id != 33) {
						return {
							color: 'rgba(0,0,0,0.8)',
							size: 3
						};
					}

					return {
						color: 'rgba(255,0,0,0.8)',
						size: 3,
						offset: 2
					};

				case 'Polygon':
				case 'MultiPolygon':
					return {
						color: 'rgba(43,140,190,0.4)',
						outline: {
							color: 'rgb(0,0,0)',
							size: 1
						}
					};

				default:
					return null;
			}
		},
		onEachFeature : function(feature,layer) {
			layer.bindPopup(JSON.stringify(feature.properties))
		}
	});

	$.ajax({
		url: "http://37.139.29.45:8080/geoserver/wfs?request=GetFeature&typeName=icm_traffic&outputFormat=text/javascript&srsName=EPSG:4326&format_options=callback:gjsonCB",
		jsonpCallback: "gjsonCB",
		dataType: "jsonp",
		jsonp: false,
		success: function(response) {

			geoJsonLayer.addData(response);

			var features = response.features;

			var colors = ["red","yellow","green"];

			setInterval(function(){
				var feature = features[Math.floor(Math.random()*features.length)];
				feature.properties.color = colors[ Math.floor(Math.random()*colors.length)];

				trafficLayer.updateFeature(feature);
			},2);
		}
	});

	L.control.layers({},{"TileCanvas":trafficLayer,"SVG":geoJsonLayer},{collapsed:false}).addTo(map);

}

$(document).ready(initMap);