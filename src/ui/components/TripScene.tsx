/** Ilustración plana para la meta de viaje (sin fotos externas, funciona sin conexión). */
export function TripScene() {
  return (
    <svg className="scene" viewBox="0 0 700 200" preserveAspectRatio="xMidYMax slice" aria-hidden>
      <rect width="700" height="200" fill="#123c3a" />
      <circle cx="600" cy="58" r="20" fill="#a3e635" opacity=".85" />
      <path d="M0 160 L90 110 L150 135 L240 80 L330 140 L420 95 L520 135 L600 105 L700 140 V200 H0Z" fill="#1b4a47" />
      <path d="M0 178 L120 145 L220 170 L330 138 L450 168 L560 142 L700 160 V200 H0Z" fill="#2f6b5e" />
      <path d="M0 192 Q175 178 350 190 T700 186 V200 H0Z" fill="#0d2a28" />
    </svg>
  );
}
