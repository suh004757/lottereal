/**
 * Map-active.js - Google Maps 초기화 및 마커 표시
 * 특정 주소에 대한 지도를 표시하고 마커를 추가합니다.
 */

// 전역 변수 선언
var map;
var latlng = new google.maps.LatLng(56.9496, 24.1052);

// 지도 스타일 설정 (흑백 스타일)
var stylez = [{
    featureType: "all",
    elementType: "all",
    stylers: [{
        saturation: -25
    }]
}];

// 지도 옵션 설정
var mapOptions = {
    zoom: 15,
    center: latlng,
    scrollwheel: false,
    scaleControl: false,
    disableDefaultUI: true,
    mapTypeControlOptions: {
        mapTypeIds: [google.maps.MapTypeId.ROADMAP, 'gMap']
    }
};

// 지도 초기화
map = new google.maps.Map(document.getElementById("googleMap"), mapOptions);

// 지오코더 초기화
var geocoder_map = new google.maps.Geocoder();

// 대상 주소
var address = '29, Baekjegobun-ro 27-gil, Songpa-gu, Seoul, Republic of Korea';

// 주소로 좌표 변환 및 마커 표시
geocoder_map.geocode({
    'address': address
}, function (results, status) {
    if (status == google.maps.GeocoderStatus.OK) {
        // 지도 중심을 변환된 좌표로 설정
        map.setCenter(results[0].geometry.location);

        // 마커 생성 및 추가
        var marker = new google.maps.Marker({
            map: map,
            icon: '',
            position: map.getCenter(),
            animation: google.maps.Animation.BOUNCE,
        });
    } else {
        // 지오코딩 실패 시 알림
        alert("Geocode was not successful for the following reason: " + status);
    }
});

// 커스텀 지도 타입 설정
var mapType = new google.maps.StyledMapType(stylez, {
    name: "Grayscale"
});
map.mapTypes.set('gMap', mapType);
map.setMapTypeId('gMap');