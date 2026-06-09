import fs from "node:fs";

const file = "api/whatsapp/template.ts";
if (!fs.existsSync(file)) process.exit(0);
let src = fs.readFileSync(file, "utf8");

src = src.replace('recipient_type: "individual", ', '');
src = src.replace('recipient_type: "individual",', '');
src = src.replace('recipient_type:"individual",', '');

fs.writeFileSync(file, src);
console.log("patch-whatsapp-template-payload-v41: recipient_type removido");
