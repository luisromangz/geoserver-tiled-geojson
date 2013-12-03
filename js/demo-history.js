function initMap() {



	// Centered in Quito, Ecuador
	var map = L.map('map');
	map.setView([-0.2298500, -78.5249500], 9)
	L.tileLayer('http://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', {
		attribution: 'Map data &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors, <a href="http://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, Imagery © <a href="http://cloudmade.com">CloudMade</a>',
		maxZoom: 18
	}).addTo(map);
	

	var historyLayer = new L.HistoricalGeoJsonLayer({
		dateFormat: function(date) {
			return L.Util.template("{date} ({fromNow})",{
				date: date.format(),
				fromNow: date.fromNow()
			});
		}
	});
	historyLayer.styleFor = canvasStyles;
	
	var colors = ["red","yellow","green"];

	var now = moment(new Date());

	$.ajax({
		url: "http://37.139.29.45:8080/geoserver/wfs?request=GetFeature&typeName=icm_traffic&outputFormat=text/javascript&srsName=EPSG:4326&format_options=callback:gjsonCB",
		jsonpCallback: "gjsonCB",
		dataType: "jsonp",
		jsonp: false,
		success: function(response) {
			var features = response.features;

			// We make an string so we are cloning the features.
			var featuresString = JSON.stringify(features);

			for(var i=0; i< 24; i++) {
				var timePointFeatures = JSON.parse(featuresString);

				// We randomize feature color.
				for(var j=0; j< timePointFeatures.length; j++) {
					var feature = timePointFeatures[j];
					feature.properties.color = colors[ Math.floor(Math.random()*colors.length)];
				}

				var timePoint = now.subtract("hours",1).toDate();

				historyLayer.addTimePoint(timePoint, timePointFeatures);
			}	

			historyLayer.addTo(map);
		}
	});

	
}

function canvasStyles (feature) {
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
}

$(document).ready(initMap);