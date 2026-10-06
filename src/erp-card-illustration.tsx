/** Small decorative illustrations; the card text provides the accessible name. */
export function ErpCardIllustration({ service }: { service: string }) {
  return <svg className={`erp-card-art erp-card-art-${service}`} viewBox="0 0 64 64" fill="none" aria-hidden="true" focusable="false">
    {service === 'timetable' && <>
      <rect x="10" y="15" width="44" height="40" rx="9" fill="#ddd6fe"/>
      <g className="erp-art-page">
        <rect x="10" y="12" width="44" height="40" rx="8" fill="#fff" stroke="#8b5cf6" strokeWidth="2"/>
        <path d="M10 22a8 8 0 0 1 8-10h28a8 8 0 0 1 8 10v4H10Z" fill="#8b5cf6"/>
        <path d="M22 8v10m20-10v10" stroke="#5b21b6" strokeWidth="4" strokeLinecap="round"/>
        <g fill="#ddd6fe"><rect x="18" y="32" width="6" height="5" rx="2"/><rect x="29" y="32" width="6" height="5" rx="2"/><rect x="40" y="32" width="6" height="5" rx="2"/><rect x="18" y="42" width="6" height="5" rx="2"/><rect x="29" y="42" width="6" height="5" rx="2"/></g>
        <path d="m39 44 3 3 5-6" stroke="#14b8a6" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
      </g>
    </>}
    {service === 'fees' && <>
      <rect x="8" y="24" width="46" height="29" rx="9" fill="#7c3aed"/>
      <path d="M12 25V21a5 5 0 0 1 5-5h28" stroke="#a78bfa" strokeWidth="5" strokeLinecap="round"/>
      <rect x="39" y="33" width="18" height="12" rx="5" fill="#c4b5fd"/>
      <circle cx="46" cy="39" r="2" fill="#5b21b6"/>
      <g className="erp-art-coin"><circle cx="31" cy="18" r="11" fill="#fbbf24" stroke="#f59e0b" strokeWidth="2"/><circle cx="31" cy="18" r="7" stroke="#fde68a" strokeWidth="1.5"/><path d="M28 14h6m-6 3h6m-6-3c5 0 5 6 0 6l6 4" stroke="#92400e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></g>
    </>}
    {service === 'homework' && <>
      <rect x="12" y="12" width="35" height="43" rx="7" fill="#ddd6fe"/>
      <rect x="9" y="9" width="35" height="43" rx="7" fill="#fff" stroke="#8b5cf6" strokeWidth="2"/>
      <path d="M18 20h17m-17 7h14m-14 7h10" stroke="#c4b5fd" strokeWidth="3" strokeLinecap="round"/>
      <path className="erp-art-writing" d="M18 42h15" stroke="#8b5cf6" strokeWidth="3" strokeLinecap="round"/>
      <g className="erp-art-pencil" transform="rotate(30 43 32)"><rect x="39" y="14" width="9" height="30" rx="2" fill="#fbbf24"/><path d="M39 44h9l-4.5 9Z" fill="#fcd9b1"/><path d="m42 50 1.5 3 1.5-3Z" fill="#5b21b6"/><rect x="39" y="10" width="9" height="7" rx="2" fill="#fb7185"/><path d="M39 18h9" stroke="#fde68a" strokeWidth="3"/></g>
    </>}
  </svg>;
}
