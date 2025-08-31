export const cn = (...c:(string|undefined|false|null)[]) => c.filter(Boolean).join(' ')
