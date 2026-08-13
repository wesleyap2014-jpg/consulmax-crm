import fs from "node:fs";
const file="src/pages/Carteira.tsx";let src=fs.readFileSync(file,"utf8");
const old=`          <button onClick={() => setShowModal(true)} className="px-4 py-2 rounded-xl bg-[#1E293F] text-white hover:opacity-90">`;
const neu=`          <button onClick={() => { setForm((f) => ({ ...f, vendedor_id: canChooseSaleSeller ? "" : userId })); setShowModal(true); }} className="px-4 py-2 rounded-xl bg-[#1E293F] text-white hover:opacity-90">`;
if(!src.includes(old))throw new Error("[carteira-seller-button] botão não encontrado");src=src.replace(old,neu);fs.writeFileSync(file,src);console.log("[carteira-seller-button] aplicado");