// FR122, UX-DR14: LinkedIn placeholder — aguardando integração com API LinkedIn

/**
 * Placeholder dedicado para quando LinkedIn é a única source selecionada.
 * Exibe estado "Em breve" com ícone LinkedIn e mensagem explicativa.
 * Não reutiliza EmptyState porque precisa de SVG icon, texto secundário e bg sutil.
 */
export default function LinkedInPlaceholder() {
  return (
    <div
      className="flex flex-col items-center justify-center py-16 text-content-tertiary bg-surface-secondary/30 rounded-2xl"
      role="status"
      aria-label="LinkedIn Ads — aguardando integração. Dados serão exibidos quando a integração estiver ativa."
    >
      {/* LinkedIn icon inline — cor oficial #0A66C2 com opacidade reduzida */}
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        className="w-10 h-10 opacity-40 mb-4 text-[#0A66C2]"
        aria-hidden="true"
      >
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
      </svg>
      <p className="text-sm font-medium">
        Em breve — aguardando integração com API LinkedIn
      </p>
      <p className="text-xs text-content-tertiary/60 mt-1">
        Dados do LinkedIn Ads serão exibidos aqui quando a integração estiver ativa
      </p>
    </div>
  );
}
