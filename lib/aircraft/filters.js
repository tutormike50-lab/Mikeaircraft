const PRIVATE_TYPES=new Set([
  "LJ23","LJ24","LJ25","LJ28","LJ31","LJ35","LJ36","LJ40","LJ45","LJ55","LJ60","LJ70","LJ75",
  "C500","C501","C510","C525","C526","C550","C551","C560","C56X","C650","C680","C68A","C700","C750",
  "GLF2","GLF3","GLF4","GLF5","GLF6","G150","G200","G280","GLEX","GL5T","GL6T","GALX",
  "FA10","FA20","FA50","F2TH","F900","F7X","F8X",
  "CL30","CL35","CL60","BD10","BD70","BD90",
  "H25A","H25B","H25C","BE40","PRM1",
  "E50P","E55P","E35L","E45X","E545","E550",
  "PC24","HDJT","SF50","EA50",
  "C150","C152","C172","C177","C182","C206","C210","PA24","PA28","PA32","PA34","PA46",
  "SR20","SR22","DA40","DA42","DA62","BE33","BE35","BE36","BE55","BE58","M20P","M20T",
  "TBM7","TBM8","TBM9","PC12","BE20","BE30","B350"
]);
const REJECTED_CATEGORIES=new Set(["A7","B1","B2","B3","B4","B6","B7","C1","C2","C3","C4","C5"]);
const REJECTED_EXACT=new Set(["GND","TWR","EMER","GROUND","TOWER"]);
const REJECTED_PREFIXES=["FOLLOW","POZAR","TXLU","UDRZBA","AIRPORT","GROUND","TWR","GND","EMER"];

const clean=v=>String(v||"").trim().toUpperCase();
function aircraftType(ac){return clean(ac?.type||ac?.typeCode||ac?.aircraft?.typeCode||ac?.t);}
function isPrivateOrBusiness(ac){
  if(!ac) return false;
  const type=aircraftType(ac);
  if(PRIVATE_TYPES.has(type)) return true;
  if(/^LJ\d{2}$/.test(type)) return true;
  if(/^GLF[2-6]$/.test(type)) return true;
  if(/^FA(10|20|50)$/.test(type)) return true;
  return false;
}
function isGroundServiceOrNoise(ac){
  if(!ac) return false;
  const flight=clean(ac.flight||ac.callsign),type=aircraftType(ac),registration=clean(ac.r||ac.registration),category=clean(ac.category);
  if(REJECTED_CATEGORIES.has(category)||REJECTED_EXACT.has(type)||REJECTED_EXACT.has(registration)||REJECTED_EXACT.has(flight)) return true;
  return REJECTED_PREFIXES.some(p=>flight.startsWith(p)||registration.startsWith(p)||type.startsWith(p));
}
function isViewerEligible(ac){return Boolean(ac)&&!isPrivateOrBusiness(ac)&&!isGroundServiceOrNoise(ac);}
function filterViewerAircraft(list){return Array.isArray(list)?list.filter(isViewerEligible):[];}

module.exports={PRIVATE_TYPES,isPrivateOrBusiness,isGroundServiceOrNoise,isViewerEligible,filterViewerAircraft};
