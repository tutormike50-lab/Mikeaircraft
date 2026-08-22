const assert=require("assert");
const {normalizeAirportCode,getAirport,endpointMatchesAirport}=require("../config/airports.js");
const {lookupOperator}=require("../data/operators.js");
const {lookupAircraftType}=require("../data/aircraft-types.js");
const {isPrivateOrBusiness,isViewerEligible}=require("../aircraft/filters.js");
const {evaluateRouteCoherence}=require("../route/coherence.js");

function run(){
  assert.equal(normalizeAirportCode("atl"),"ATL");
  assert.equal(getAirport("PRG").icao,"LKPR");
  assert.equal(endpointMatchesAirport({iata:"ATL"},"ATL"),true);
  assert.equal(lookupOperator("HLJ123").name,"HelloJets");
  assert.equal(lookupOperator("SWR27M").display,"LX27M");
  assert.equal(lookupAircraftType("A359").name,"Airbus A350-900");
  assert.equal(isPrivateOrBusiness({type:"C56X"}),true);
  assert.equal(isPrivateOrBusiness({type:"A320"}),false);
  assert.equal(isViewerEligible({type:"A320",callsign:"DLH1"}),true);
  assert.equal(evaluateRouteCoherence({route:{found:true,origin:{iata:"ZRH"},destination:{iata:"PRG"}},movement:{lineage:"ARRIVAL"},airportCode:"PRG"}).accepted,true);
  assert.equal(evaluateRouteCoherence({route:{found:true,origin:{iata:"PRG"},destination:{iata:"ATH"}},movement:{lineage:"ARRIVAL"},airportCode:"PRG"}).accepted,false);
  return {ok:true,tests:11};
}
if(require.main===module)console.log(JSON.stringify(run()));
module.exports={run};
