type Person = { full_name: string | null };

const ANONYMISED = "Cliente anonimizado";

function firstName(person: Person): string {
  if (!person.full_name) return ANONYMISED;
  return person.full_name.trim().split(/\s+/)[0] ?? ANONYMISED;
}

export function coupleLabel(groom: Person, bride: Person): string {
  if (!groom.full_name && !bride.full_name) return "Clientes anonimizados";
  return `${firstName(groom)} & ${firstName(bride)}`;
}
