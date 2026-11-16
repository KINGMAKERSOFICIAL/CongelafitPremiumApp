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
