const baseHandler=require("./overlay-base.js");
const {applyOverlayV11}=require("./overlay/patch-v11.js");

module.exports=async function handler(req,res){
  const originalSend=res.send.bind(res);
  res.send=function patchedSend(body){
    if(typeof body!=="string")return originalSend(body);
    return originalSend(applyOverlayV11(body));
  };
  return baseHandler(req,res);
};
