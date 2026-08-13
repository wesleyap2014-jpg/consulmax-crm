import fs from "node:fs";
const file="src/pages/Clientes.tsx";
let src=fs.readFileSync(file,"utf8");
if(src.includes('<ClienteCadastroSimplificado')){console.log('[clientes-cadastro] formulário já aplicado');process.exit(0)}
const startMarker='          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">\n            {/* Identidade */}';
const endMarker='\n          <div className="mt-5 flex items-center justify-end gap-2">';
const start=src.indexOf(startMarker),end=src.indexOf(endMarker,start);
if(start<0||end<0)throw new Error('[clientes-cadastro] bloco antigo não encontrado');
const form=`          <ClienteCadastroSimplificado
            readOnly={readOnly}
            nome={nome}
            setNome={setNome}
            birth={birth}
            setBirth={setBirth}
            chamadoComo={chamadoComo}
            setChamadoComo={setChamadoComo}
            extra={extra}
            setExtra={setExtra}
            fotoFile={fotoFile}
            setFotoFile={setFotoFile}
            phoneCountry={phoneCountry}
            setPhoneCountry={setPhoneCountry}
            phoneCountries={phoneCountries}
            telefone={telefone}
            setTelefone={setTelefone}
            email={email}
            setEmail={setEmail}
            buscarCep={buscarCep}
            cepLoading={cepLoading}
            onlyDigits={onlyDigits}
            clamp={clamp}
          />`;
src=src.slice(0,start)+form+src.slice(end);
fs.writeFileSync(file,src);
console.log('[clientes-cadastro] formulário simplificado aplicado');
