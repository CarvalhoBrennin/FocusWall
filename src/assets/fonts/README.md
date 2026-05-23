Para funcionamento offline, baixe as fontes variáveis (woff2) e coloque em src/assets/fonts/:

Manrope:
  https://fonts.google.com/specimen/Manrope
  Baixar: Manrope-VariableFont_wght.woff2 (coloque em src/assets/fonts/)

Orbitron:
  https://fonts.google.com/specimen/Orbitron
  Baixar: Orbitron-VariableFont_wght.woff2 (coloque em src/assets/fonts/)

Alternativa via npm:
  npm install @fontsource-variable/manrope @fontsource-variable/orbitron

O index.html já referencia estes arquivos com fallback para o CDN do Google Fonts.
Enquanto as fontes locais não estiverem presentes, o CDN continua funcionando normalmente.
