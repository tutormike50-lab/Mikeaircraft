const {runCollector}=require("../lib/learner/collector.js");

module.exports=async function handler(req,res){
  res.setHeader("Cache-Control","no-store");
  try{
    const result=await runCollector();
    return res.status(result.ok?200:503).json({service:"MikeAircraft Network Learner",...result});
  }catch(error){
    return res.status(500).json({ok:false,service:"MikeAircraft Network Learner",error:error.message});
  }
};
