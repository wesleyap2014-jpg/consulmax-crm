alter table public.robot_sync_jobs
  drop constraint if exists robot_sync_jobs_segment_check;

alter table public.robot_sync_jobs
  add constraint robot_sync_jobs_segment_check
  check (
    (
      mode = 'segment'
      and (
        (administradora = 'bb' and segment in (
          'auto_ipca',
          'auto_fipe',
          'outros_bens',
          'pesados',
          'motocicleta',
          'imoveis'
        ))
        or
        (administradora = 'maggi' and segment in ('automoveis', 'imoveis'))
      )
    )
    or (mode <> 'segment' and segment is null)
  );

comment on constraint robot_sync_jobs_segment_check on public.robot_sync_jobs is
  'Restringe segmentos de trabalhos unitários conforme a administradora.';
