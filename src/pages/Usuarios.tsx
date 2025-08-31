// no topo do componente
const w = watch();

// ...depois dos outros useEffects
React.useEffect(() => {
  const raw = (w?.cep || '').replace(/\D/g, '');
  if (raw.length !== 8) return;

  let canceled = false;
  (async () => {
    try {
      const r = await fetch(`https://viacep.com.br/ws/${raw}/json/`);
      const d = await r.json();
      if (canceled || d?.erro) return;
      setValue('logradouro', d.logradouro || '');
      setValue('bairro',     d.bairro     || '');
      setValue('cidade',     d.localidade || '');
      setValue('uf',         d.uf         || '');
    } catch {
      /* silencioso */
    }
  })();

  return () => { canceled = true; };
}, [w?.cep, setValue]);
