const AIRPORTS = {
  PRG:{name:"Prague Airport",iata:"PRG",icao:"LKPR",lat:50.1008,lon:14.2600,runwayEnds:[
    {name:"06",heading:65,lat:50.1017990,lon:14.2263002},{name:"24",heading:245,lat:50.1160011,lon:14.2734003},
    {name:"12",heading:127,lat:50.1080017,lon:14.2454004},{name:"30",heading:307,lat:50.0904999,lon:14.2817001}]},
  LHR:{name:"London Heathrow",iata:"LHR",icao:"EGLL",lat:51.471227,lon:-0.460881,runwayEnds:[
    {name:"09L",heading:90,lat:51.477490,lon:-0.489439},{name:"27R",heading:270,lat:51.477681,lon:-0.433227},
    {name:"09R",heading:90,lat:51.464780,lon:-0.486808},{name:"27L",heading:270,lat:51.464957,lon:-0.434048}]},
  FRA:{name:"Frankfurt Airport",iata:"FRA",icao:"EDDF",lat:50.032606,lon:8.540669,runwayEnds:[
    {name:"07C",heading:70,lat:50.0326004,lon:8.5346298},{name:"25C",heading:250,lat:50.0451012,lon:8.5869799},
    {name:"07L",heading:70,lat:50.0371017,lon:8.4970798},{name:"25R",heading:250,lat:50.0457993,lon:8.5337200},
    {name:"07R",heading:70,lat:50.0275002,lon:8.5341702},{name:"25L",heading:250,lat:50.0401001,lon:8.5865297},
    {name:"18",heading:180,lat:50.0341540,lon:8.5259440},{name:"36",heading:360,lat:49.9984930,lon:8.5262970}]},
  AMS:{name:"Amsterdam Schiphol",iata:"AMS",icao:"EHAM",lat:52.314875,lon:4.758074,runwayEnds:[
    {name:"04",heading:41,lat:52.3003998,lon:4.7834802},{name:"22",heading:221,lat:52.3139992,lon:4.8030200},
    {name:"06",heading:58,lat:52.2878990,lon:4.7340202},{name:"24",heading:238,lat:52.3045998,lon:4.7775202},
    {name:"09",heading:87,lat:52.3166008,lon:4.7463498},{name:"27",heading:267,lat:52.3184013,lon:4.7968898},
    {name:"18C",heading:183,lat:52.3314018,lon:4.7400298},{name:"36C",heading:3,lat:52.3017998,lon:4.7375002},
    {name:"18L",heading:183,lat:52.3213005,lon:4.7799602},{name:"36R",heading:3,lat:52.2907982,lon:4.7773499},
    {name:"18R",heading:183,lat:52.3627014,lon:4.7119298},{name:"36L",heading:3,lat:52.3286018,lon:4.7088399}]},
  CDG:{name:"Paris Charles de Gaulle",iata:"CDG",icao:"LFPG",lat:49.009750,lon:2.562618,runwayEnds:[
    {name:"08L",heading:85,lat:48.9957008,lon:2.5527401},{name:"26R",heading:265,lat:48.9987984,lon:2.6101799},
    {name:"08R",heading:85,lat:48.9929008,lon:2.5656600},{name:"26L",heading:265,lat:48.9948997,lon:2.6024301},
    {name:"09L",heading:85,lat:49.0247002,lon:2.5248899},{name:"27R",heading:265,lat:49.0266991,lon:2.5616901},
    {name:"09R",heading:86,lat:49.0205994,lon:2.5130601},{name:"27L",heading:266,lat:49.0237007,lon:2.5702901}]},
  MAN:{name:"Manchester Airport",iata:"MAN",icao:"EGCC",lat:53.347150,lon:-2.283883,runwayEnds:[
    {name:"05L",heading:51,lat:53.3451004,lon:-2.2927401},{name:"23R",heading:231,lat:53.3624001,lon:-2.2571399},
    {name:"05R",heading:51,lat:53.3320010,lon:-2.3106600},{name:"23L",heading:231,lat:53.3490980,lon:-2.2749900}]},
  ATL:{name:"Hartsfield-Jackson Atlanta International",iata:"ATL",icao:"KATL",lat:33.6366996,lon:-84.4278640,runwayEnds:[
    {name:"09L",heading:90,lat:33.6347045,lon:-84.4479669},{name:"27R",heading:270,lat:33.6347025,lon:-84.4072661},
    {name:"08R",heading:90,lat:33.6467867,lon:-84.4383621},{name:"26L",heading:270,lat:33.6467948,lon:-84.4055087},
    {name:"08L",heading:90,lat:33.6495344,lon:-84.4390256},{name:"26R",heading:270,lat:33.6495421,lon:-84.4094539},
    {name:"09R",heading:90,lat:33.6318134,lon:-84.4479658},{name:"27L",heading:270,lat:33.6318236,lon:-84.4184008},
    {name:"10",heading:90,lat:33.6202725,lon:-84.4478771},{name:"28",heading:270,lat:33.6202854,lon:-84.4183155}]}
};

function normalizeAirportCode(value, fallback="PRG") {
  const code=String(value||fallback).trim().toUpperCase();
  return AIRPORTS[code] ? code : fallback;
}
function getAirport(value, fallback="PRG") {
  const code=normalizeAirportCode(value,fallback);
  return {code,...AIRPORTS[code]};
}
function endpointMatchesAirport(endpoint, airportCode) {
  if(!endpoint) return false;
  const airport=getAirport(airportCode);
  const iata=String(endpoint.iata||"").toUpperCase();
  const icao=String(endpoint.icao||"").toUpperCase();
  return iata===airport.iata || icao===airport.icao;
}

module.exports={AIRPORTS,normalizeAirportCode,getAirport,endpointMatchesAirport};
