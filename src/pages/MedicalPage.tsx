// The single static medical page. Replace the SECTIONS content with your real material.
const SECTIONS = [
  { id: 'overview', title: 'Overview', body: 'Placeholder: introduce what this reference covers and who it is for.' },
  { id: 'triage', title: 'Triage & Priority Levels', body: 'Placeholder: describe how patients are prioritized.' },
  { id: 'conditions', title: 'Common Conditions', body: 'Placeholder: list conditions, signs and symptoms.' },
  { id: 'medications', title: 'Medications', body: 'Placeholder: medication reference, dosing notes, interactions.' },
  { id: 'procedures', title: 'Procedures', body: 'Placeholder: step-by-step procedures.' },
  { id: 'resources', title: 'Resources & Contacts', body: 'Placeholder: phone numbers, links, further reading.' },
];

export function MedicalPage() {
  return (
    <div className="medical">
      <aside className="toc">
        <h4>On this page</h4>
        <ul>
          {SECTIONS.map((s) => (
            <li key={s.id}><a href={`#${s.id}`}>{s.title}</a></li>
          ))}
        </ul>
      </aside>
      <article className="medical-body">
        <h1>Medical Reference</h1>
        {SECTIONS.map((s) => (
          <section key={s.id} id={s.id}>
            <h2>{s.title}</h2>
            <p>{s.body}</p>
          </section>
        ))}
      </article>
    </div>
  );
}
