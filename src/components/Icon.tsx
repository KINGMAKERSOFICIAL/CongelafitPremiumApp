const P: Record<string, string> = {
  home: 'M3 11.5 12 4l9 7.5M5.5 10v9.5h4.5v-6h4v6h4.5V10',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm9 16-4-4',
  heart:
    'M12 20s-7.5-4.6-9.2-9.4C1.6 7.2 3.7 4.5 6.6 4.5c1.9 0 3.4 1 5.4 3.1 2-2.1 3.5-3.1 5.4-3.1 2.9 0 5 2.7 3.8 6.1C19.5 15.4 12 20 12 20Z',
  info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 8v5m0-8.2v.2',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4.5V12l3.2 2',
  flame:
    'M12 3c.6 3 4.5 4.8 4.5 9.2A4.5 4.5 0 0 1 12 17a4.5 4.5 0 0 1-4.5-4.8c0-1.7.8-2.9 1.8-3.9.3 1.3.9 2 1.7 2.4C11.3 8 11 5.3 12 3Zm0 14v4',
  utensils: 'M7 3v8m-2.5-8v5a2.5 2.5 0 0 0 5 0V3M7 11v10m9.5-18c-2 1.4-3 4-3 7h3v11m0-18v18',
  back: 'M15 5 8 12l7 7',
  share: 'M12 15V3m0 0L8 7m4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7',
  check: 'm5 12.5 4.5 4.5L19 7.5',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-5v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4m0-12.8L17 7M7 17l-1.4 1.4',
  close: 'M6 6l12 12M18 6 6 18',
  arrow: 'm9 5 7 7-7 7',
  reset: 'M4 12a8 8 0 1 0 2.5-5.8M4 4v4.5h4.5',
  book: 'M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5v-15ZM5 19.5A1.5 1.5 0 0 0 6.5 21H19v-3M9 7h6',
  snow: 'M12 2.5v19M3.8 7.25l16.4 9.5M20.2 7.25l-16.4 9.5M9.5 4.7 12 7.2l2.5-2.5M9.5 19.3 12 16.8l2.5 2.5',
  calendar: 'M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1ZM4 10h16M8 3v4m8-4v4',
  cart: 'M3 4h2.2l2 11h10.3l2-8H6.2M9.5 20h.01M17 20h.01',
  menu: 'M4 7h16M4 12h16M4 17h16',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  trash: 'M4 7h16M10 7V4h4v3M6.5 7l1 13h9l1-13M10 11v6m4-6v6',
  edit: 'M4 20l1-4L16.5 4.5a2 2 0 0 1 3 3L8 19l-4 1Z',
  tag: 'M4 4h8l8 8-8 8-8-8V4Zm4 3.5v.01',
  download: 'M12 4v11m0 0-4-4m4 4 4-4M5 20h14',
  upload: 'M12 16V5m0 0-4 4m4-4 4 4M5 20h14',
  warn: 'M12 4 3 19h18L12 4Zm0 6v4m0 3v.01',
  box: 'M3 8l9-4 9 4v9l-9 4-9-4V8Zm0 0 9 4 9-4M12 12v9',
  list: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
  thermo: 'M10 14.5V5a2 2 0 1 1 4 0v9.5a4 4 0 1 1-4 0Z',
  spark:
    'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Zm7 12 .7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7L19 15Z',
  printer:
    'M7 9V4h10v5M7 17H5a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-2M7 14h10v6H7v-6Z',
  shield: 'M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3Zm-3 9 2 2 4-4',
  down: 'm6 9 6 6 6-6',
  gift: 'M4 9h16v4H4V9Zm1 4h14v8H5v-8Zm7-4v12M12 9c-2 0-4-1-4-3s3-2 4 3c1-5 4-5 4-3s-2 3-4 3Z',
  lock: 'M7 11V7a5 5 0 0 1 10 0v4M5 11h14v9H5v-9Zm7 3.5v2.5',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0',
  chart: 'M4 19h16M7 16v-5m5 5V7m5 9v-8',
  link: 'M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.5 1.5M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7L13 18',
  image: 'M4 5h16v14H4V5Zm4 4a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm-4 7 4-4 3 3 4-4 5 5',
  bag: 'M6 8h12l1 12H5L6 8Zm3 0V6a3 3 0 0 1 6 0v2',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4m7 14 5-5-5-5m5 5H9',
  copy: 'M9 9h11v11H9V9ZM5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1',
  send: 'M21 3 10 14M21 3l-7 18-4-7-7-4 18-7Z',
  external: 'M14 4h6v6m0-6L10 14M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6',
};

export function Icon({
  name,
  size = 20,
  className,
}: {
  name: keyof typeof P | string;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d={P[name] ?? ''} />
    </svg>
  );
}

const CATEGORY_ICON_PATHS: Record<string, string> = {
  'sufles-e-tortas':
    'M4 13h16v3a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4v-3ZM3 13c1.5-2.5 4-4 9-4s7.5 1.5 9 4M9 5.5c0 1 .7 1.5.7 2.5M15 5.5c0 1 .7 1.5.7 2.5',
  'peixes-e-frutos-do-mar':
    'M3 12c3.5-4.5 9-5 13-1.5L20.5 7v10L16 13.5C12 17 6.5 16.5 3 12Zm4.5-.2h.01',
  aves: 'M14.5 4.5a4 4 0 0 1 5 5c-1.5 2-4.5 3.5-7 3.5L8 17.5a2 2 0 1 1-2.8-2.8l4.5-4.5c0-2.5 1.5-5.5 4.8-5.7Zm-9 13.5a1.5 1.5 0 1 0 2.1 2.1',
  carnes:
    'M6 7c3.5-2.5 10-2 13 1.5 2.2 2.5 1.5 7-2 8.8-3.5 1.8-9.5 1.7-12-1.3-2.2-2.6-1.5-7 1-9Zm4.5 4.5c1.5-1 3.5-.5 4 1 .5 1.2-.5 2.5-2 2.5s-3-2-2-3.5Z',
  'legumes-e-acompanhamentos':
    'M15 4c1.5 0 3 1 3 2.5-1.5 1-3 .5-3-2.5Zm-1 3.5c2 0 3.5 1.5 3.5 3.5-1 3-6.5 8.5-9.5 9.5-.8.3-1.5-.4-1.2-1.2C7.8 16.3 13.3 10.8 14 7.5Zm-3.5 4 2 2m-4 1.5 1.5 1.5',
  'pizzas-e-massas':
    'M12 3 3.5 19.5a14 14 0 0 0 17 0L12 3Zm-5 11.5a13 13 0 0 1 10 0M10.5 10h.01M13.5 12.5h.01',
  saladas:
    'M4 13h16a8 8 0 0 1-16 0Zm3-1c0-3 2.5-5.5 5-5.5S17 9 17 12M12 6.5c0-2 1.5-3.5 3.5-3.5-.2 2-1.5 3.5-3.5 3.5Z',
  'sopas-caldos-e-cremes':
    'M4 12h16v1a7 7 0 0 1-14 0v-1h-2Zm4 8h8M9 5c0 1.2.8 1.8.8 3M12 4.5c0 1.2.8 1.8.8 3M15 5c0 1.2.8 1.8.8 3',
  'farinhas-e-farofas':
    'M12 20V5m0 11-3.5-3.5m3.5 3.5 3.5-3.5M12 11.5 8.5 8m3.5 3.5L15.5 8M12 7 9.5 4.5M12 7l2.5-2.5',
  'molhos-maioneses-e-pates':
    'M9 3h6v3l2 3v9a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V9l2-3V3Zm0 7h6m-4 4h2',
  'omeletes-e-ovos':
    'M12 3.5c-3.5 0-6.5 5.5-6.5 10a6.5 6.5 0 0 0 13 0c0-4.5-3-10-6.5-10Zm-1.5 9.5a2 2 0 1 0 3 2',
  'paes-panquecas-e-lanches':
    'M4 15c0-4.5 3.5-8 8-8s8 3.5 8 8v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2Zm4-6.5 1.5 3M12 7v3.5m4-2-1.5 3',
  'mingaus-granolas-e-iogurtes':
    'M4 12h16a8 8 0 0 1-16 0Zm10 0 3.5-6.5a1.5 1.5 0 1 1 2.2 1.8L16 12',
  'bebidas-e-vitaminas': 'M7 8h10l-1.2 12H8.2L7 8Zm5 0 2-4.5h3.5M6 8h12',
  'cafe-da-manha-para-congelar':
    'M5 10h11v5a5 5 0 0 1-11 0v-5Zm11 1h2a2 2 0 0 1 0 4h-2M7 5.5c0 1 .7 1.5.7 2.5M11.5 5.5c0 1 .7 1.5.7 2.5M4 20h14',
  'lanches-para-congelar':
    'M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7Zm0 5h16M12 5v7',
  'lanches-para-levar-no-trabalho':
    'M4 9a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9Zm5-2V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M4 13h16m-9 0v2h2v-2',
  'marinadas-rapidas-e-saudaveis':
    'M8 4h8v3H8V4Zm-1 3h10v11a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V7Zm0 5.5h10m-6 3h.01m3-1.5h.01',
  'bolos-e-tortas-doces': 'M4 13l8-5 8 5v6H4v-6Zm0 3h16M12 8V5m0-1.5v.01',
  'pudins-mousses-e-cremes':
    'M6 15l1.5-7h9L18 15H6Zm-2 0h16v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2Zm5-7c1-1.5 5-1.5 6 0',
  'docinhos-e-biscoitos':
    'M12 3.5a8.5 8.5 0 1 0 8.5 8.5 3 3 0 0 1-3-3 3 3 0 0 1-3-3c-.8 0-1.5-.5-2.5-2.5Zm-2.5 7h.01M14 14.5h.01M9 14.5h.01',
  'sorvetes-e-picoles': 'M8 10h8l-4 11-4-11Zm0 0a4 4 0 0 1 8 0M12 4.5a2 2 0 0 1 2 2',
  'doces-saudaveis-e-funcionais':
    'M12 3c4 2 6.5 6 6.5 10.5A6.5 6.5 0 0 1 12 20a6.5 6.5 0 0 1-6.5-6.5C5.5 9 8 5 12 3Zm0 4v13m0-7 3-2.5M12 15l-3-2.5',
};

export function CategoryIcon({
  categoryId,
  size = 24,
  className,
}: {
  categoryId: string;
  size?: number;
  className?: string;
}) {
  const path = CATEGORY_ICON_PATHS[categoryId] ?? P.utensils;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.85"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d={path} />
    </svg>
  );
}
