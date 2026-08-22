const OPERATORS={
 BAW:{name:"British Airways",iata:"BA"},AFR:{name:"Air France",iata:"AF"},KLM:{name:"KLM",iata:"KL"},DLH:{name:"Lufthansa",iata:"LH"},SWR:{name:"Swiss International Air Lines",iata:"LX"},AUA:{name:"Austrian Airlines",iata:"OS"},BEL:{name:"Brussels Airlines",iata:"SN"},SAS:{name:"Scandinavian Airlines",iata:"SK"},FIN:{name:"Finnair",iata:"AY"},IBE:{name:"Iberia",iata:"IB"},TAP:{name:"TAP Air Portugal",iata:"TP"},ITY:{name:"ITA Airways",iata:"AZ"},
 EZY:{name:"easyJet",iata:"U2"},EJU:{name:"easyJet Europe",iata:"EC"},RYR:{name:"Ryanair",iata:"FR"},WZZ:{name:"Wizz Air",iata:"W6"},TVS:{name:"Smartwings",iata:"QS"},CSA:{name:"Czech Airlines",iata:"OK"},LOT:{name:"LOT Polish Airlines",iata:"LO"},THY:{name:"Turkish Airlines",iata:"TK"},UAE:{name:"Emirates",iata:"EK"},QTR:{name:"Qatar Airways",iata:"QR"},ETD:{name:"Etihad Airways",iata:"EY"},
 AAL:{name:"American Airlines",iata:"AA"},UAL:{name:"United Airlines",iata:"UA"},DAL:{name:"Delta Air Lines",iata:"DL"},ACA:{name:"Air Canada",iata:"AC"},SIA:{name:"Singapore Airlines",iata:"SQ"},CPA:{name:"Cathay Pacific",iata:"CX"},ANA:{name:"ANA",iata:"NH"},JAL:{name:"Japan Airlines",iata:"JL"},KAL:{name:"Korean Air",iata:"KE"},QFA:{name:"Qantas",iata:"QF"},VIR:{name:"Virgin Atlantic",iata:"VS"},EIN:{name:"Aer Lingus",iata:"EI"},ICE:{name:"Icelandair",iata:"FI"},NAX:{name:"Norwegian",iata:"DY"},EXS:{name:"Jet2",iata:"LS"},TOM:{name:"TUI Airways",iata:"BY"},TUI:{name:"TUI fly",iata:"X3"},VLG:{name:"Vueling",iata:"VY"},TRA:{name:"Transavia",iata:"HV"},AEE:{name:"Aegean Airlines",iata:"A3"},ROT:{name:"TAROM",iata:"RO"},BTI:{name:"airBaltic",iata:"BT"},PGT:{name:"Pegasus Airlines",iata:"PC"},MSR:{name:"EgyptAir",iata:"MS"},ETH:{name:"Ethiopian Airlines",iata:"ET"},RAM:{name:"Royal Air Maroc",iata:"AT"},ISR:{name:"Israir",iata:"6H"},ELY:{name:"EL AL",iata:"LY"},
 HLJ:{name:"HelloJets",iata:"H3"}
};
function lookupOperator(callsign){
 const value=String(callsign||"").trim().toUpperCase();
 if(!value) return null;
 const icao=value.slice(0,3),entry=OPERATORS[icao]||null,operationalNumber=value.length>3?value.slice(3):null;
 return {identified:Boolean(entry),icao,iata:entry?.iata||null,name:entry?.name||null,operationalNumber,display:entry&&operationalNumber?`${entry.iata}${operationalNumber}`:value};
}
module.exports={OPERATORS,lookupOperator};
