const { researchRegistration } = require("../lib/aircraft-researcher.js");

module.exports = async function handler(req,res){
 res.setHeader("Access-Control-Allow-Origin","*");
 res.setHeader("Cache-Control","no-store");
 if(req.method!=="GET")return res.status(405).json({ok:false,error:"Method not allowed"});
 const registration=String(req.query?.registration||"").trim().toUpperCase();
 if(!registration)return res.status(400).json({ok:false,error:"registration is required"});
 try{
  const research=await researchRegistration(registration);
  return res.status(200).json({ok:true,service:"MikeAircraft Aircraft Researcher",version:"0.2",generatedAt:new Date().toISOString(),...research});
 }catch(error){return res.status(500).json({ok:false,service:"MikeAircraft Aircraft Researcher",version:"0.2",error:error.message})}
};
