import Head from 'next/head';
import ModernHeader from '../components/ModernHeader';
import Link from 'next/link';
import { useState, useEffect } from 'react';

const integrations = [
  { name: 'GitHub', icon: 'M12 0C5.374 0 0 5.373 0 12 0 17.302 3.438 21.8 8.207 23.387c.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z' },
  { name: 'GitLab', icon: 'M23.955 13.587l-1.342-4.135-2.664-8.189a.455.455 0 0 0-.867 0L16.418 9.45H7.582L4.919 1.263a.455.455 0 0 0-.867 0L1.388 9.452.045 13.587a.924.924 0 0 0 .331 1.023L12 23.054l11.624-8.443a.92.92 0 0 0 .331-1.024' },
  { name: 'Docker', icon: 'M13.5 10.5h2v2h-2v-2zm-3 0h2v2h-2v-2zm-3 0h2v2h-2v-2zm-3 0h2v2h-2v-2zm9-3h2v2h-2v-2zm-3 0h2v2h-2v-2zm-3 0h2v2h-2v-2zm-3 0h2v2h-2v-2zm3-3h2v2h-2v-2zm12 5.5c-1.5-1.5-3.5-1.5-4.5-1.5v-1c0-1.5-1.5-3-3-3h-11c-1.5 0-3 1.5-3 3v6c0 1.5 1.5 3 3 3h13.5c1.5 0 3-1.5 3-3 1.5 0 3-.5 4.5-2 .5-.5.5-1.5 0-2-.5-.5-1.5-.5-2-.5z' },
  { name: 'Node.js', icon: 'M11.998 24c-.321 0-.641-.084-.922-.247l-2.936-1.737c-.438-.245-.224-.332-.08-.383.585-.203.703-.25 1.328-.604.065-.037.151-.023.218.017l2.256 1.339c.082.045.197.045.272 0l8.795-5.076c.082-.047.134-.141.134-.238V6.921c0-.099-.053-.192-.137-.242l-8.791-5.072c-.081-.047-.189-.047-.271 0L3.075 6.68C2.99 6.729 2.936 6.825 2.936 6.921v10.15c0 .097.054.189.139.235l2.409 1.392c1.307.654 2.108-.116 2.108-.89V7.787c0-.142.114-.253.256-.253h1.115c.139 0 .255.112.255.253v10.021c0 1.745-.95 2.745-2.604 2.745-.508 0-.909 0-2.026-.551L2.28 18.675c-.57-.329-.922-.945-.922-1.604V6.921c0-.659.353-1.275.922-1.603l8.795-5.082c.557-.315 1.296-.315 1.848 0l8.794 5.082c.57.329.924.944.924 1.603v10.15c0 .659-.354 1.273-.924 1.604l-8.794 5.078C12.643 23.916 12.324 24 11.998 24z M19.099 13.993c0-1.9-1.284-2.406-3.987-2.763c-2.731-.361-3.009-.548-3.009-1.187c0-.528.235-1.233 2.258-1.233c1.807 0 2.473.389 2.747 1.607c.024.115.129.199.247.199h1.141c.071 0 .138-.031.186-.081c.048-.054.074-.123.067-.196c-.177-2.098-1.571-3.076-4.388-3.076c-2.508 0-4.004 1.058-4.004 2.833c0 1.925 1.488 2.457 3.895 2.695c2.88.282 3.103.703 3.103 1.269c0 .983-.789 1.402-2.642 1.402c-2.327 0-2.839-.584-3.011-1.742c-.02-.124-.126-.215-.253-.215h-1.137c-.141 0-.254.112-.254.253c0 1.482.806 3.248 4.655 3.248C17.501 17.007 19.099 15.91 19.099 13.993z' },
  { name: 'Python', icon: 'M14.25.18l.9.2.73.26.59.3.45.32.34.34.25.34.16.33.1.3.04.26.02.2-.01.13V8.5l-.05.63-.13.55-.21.46-.26.38-.3.31-.33.25-.35.19-.35.14-.33.1-.3.07-.26.04-.21.02H8.77l-.69.05-.59.14-.5.22-.41.27-.33.32-.27.35-.2.36-.15.37-.1.35-.07.32-.04.27-.02.21v3.06H3.17l-.21-.03-.28-.07-.32-.12-.35-.18-.36-.26-.36-.36-.35-.46-.32-.59-.28-.73-.21-.88-.14-1.05-.05-1.23.06-1.22.16-1.04.24-.87.32-.71.36-.57.4-.44.42-.33.42-.24.4-.16.36-.1.32-.05.24-.01h.16l.06.01h8.16v-.83H6.18l-.01-2.75-.02-.37.05-.34.11-.31.17-.28.25-.26.31-.23.38-.2.44-.18.51-.15.58-.12.64-.1.71-.06.77-.04.84-.02 1.27.05zm-6.3 1.98l-.23.33-.08.41.08.41.23.34.33.22.41.09.41-.09.33-.22.23-.34.08-.41-.08-.41-.23-.33-.33-.22-.41-.09-.41.09zm13.09 3.95l.28.06.32.12.35.18.36.27.36.35.35.47.32.59.28.73.21.88.14 1.04.05 1.23-.06 1.23-.16 1.04-.24.86-.32.71-.36.57-.4.45-.42.33-.42.24-.4.16-.36.09-.32.05-.24.02-.16-.01h-8.22v.82h5.84l.01 2.76.02.36-.05.34-.11.31-.17.29-.25.25-.31.24-.38.2-.44.17-.51.15-.58.13-.64.09-.71.07-.77.04-.84.01-1.27-.04-1.07-.14-.9-.2-.73-.25-.59-.3-.45-.33-.34-.34-.25-.34-.16-.33-.1-.3-.04-.25-.02-.2.01-.13v-5.34l.05-.64.13-.54.21-.46.26-.38.3-.32.33-.24.35-.2.35-.14.33-.1.3-.06.26-.04.21-.02.13-.01h5.84l.69-.05.59-.14.5-.21.41-.28.33-.32.27-.35.2-.36.15-.36.1-.35.07-.32.04-.28.02-.21V6.07h2.09l.14.01zm-6.47 14.25l-.23.33-.08.41.08.41.23.33.33.23.41.08.41-.08.33-.23.23-.33.08-.41-.08-.41-.23-.33-.33-.23-.41-.08-.41.08z' },
  { name: 'React', icon: 'M14.23 12.004a2.236 2.236 0 0 1-2.235 2.236 2.236 2.236 0 0 1-2.236-2.236 2.236 2.236 0 0 1 2.235-2.236 2.236 2.236 0 0 1 2.236 2.236zm2.648-10.69c-1.346 0-3.107.96-4.888 2.622-1.78-1.653-3.542-2.602-4.887-2.602-.41 0-.783.093-1.106.278-1.375.793-1.683 3.264-.973 6.365C1.98 8.917 0 10.42 0 12.004c0 1.59 1.99 3.097 5.043 4.03-.704 3.113-.39 5.588.988 6.38.32.187.69.275 1.102.275 1.345 0 3.107-.96 4.888-2.624 1.78 1.654 3.542 2.603 4.887 2.603.41 0 .783-.09 1.106-.275 1.374-.792 1.683-3.263.973-6.365C22.02 15.096 24 13.59 24 12.004c0-1.59-1.99-3.097-5.043-4.032.704-3.11.39-5.587-.988-6.38-.318-.184-.688-.277-1.092-.278zm-.005 1.09v.006c.225 0 .406.044.558.127.666.382.955 1.835.73 3.704-.054.46-.142.945-.25 1.44-.96-.236-2.006-.417-3.107-.534-.66-.905-1.345-1.727-2.035-2.447 1.592-1.48 3.087-2.292 4.105-2.295zm-9.77.02c1.012 0 2.514.808 4.11 2.28-.686.72-1.37 1.537-2.02 2.442-1.107.117-2.154.298-3.113.538-.112-.49-.195-.964-.254-1.42-.23-1.868.054-3.32.714-3.707.19-.09.4-.127.563-.132zm4.882 3.05c.455.468.91.992 1.36 1.564-.44-.02-.89-.034-1.345-.034-.46 0-.915.01-1.36.034.44-.572.895-1.096 1.345-1.565zM12 8.1c.74 0 1.477.034 2.202.093.406.582.802 1.203 1.183 1.86.372.64.71 1.29 1.018 1.946-.308.655-.646 1.31-1.013 1.95-.38.66-.773 1.288-1.18 1.87-.728.063-1.466.098-2.21.098-.74 0-1.477-.035-2.202-.093-.406-.582-.802-1.204-1.183-1.86-.372-.64-.71-1.29-1.018-1.946.303-.657.646-1.313 1.013-1.954.38-.66.773-1.286 1.18-1.868.728-.064 1.466-.098 2.21-.098zm-3.635.254c-.24.377-.48.763-.704 1.16-.225.39-.435.782-.635 1.174-.265-.656-.49-1.31-.676-1.947.64-.15 1.315-.283 2.015-.386zm7.26 0c.695.103 1.365.23 2.006.387-.18.632-.405 1.282-.66 1.933-.2-.39-.41-.783-.64-1.174-.225-.392-.465-.774-.705-1.146zm3.063.675c.484.15.944.317 1.375.498 1.732.74 2.852 1.708 2.852 2.476-.005.768-1.125 1.74-2.857 2.475-.42.18-.88.342-1.355.493-.28-.958-.646-1.956-1.1-2.98.45-1.017.81-2.01 1.085-2.964zm-13.395.004c.278.96.645 1.957 1.1 2.98-.45 1.017-.812 2.0' },
  { name: 'VS Code', icon: 'M23.15 2.587L18.21.21a1.494 1.494 0 0 0-1.705.29l-9.46 8.63-4.12-3.128a.999.999 0 0 0-1.276.057L.327 7.261A1 1 0 0 0 .326 8.74L3.899 12 .326 15.26a1 1 0 0 0 .001 1.479L1.65 17.94a.999.999 0 0 0 1.276.057l4.12-3.128 9.46 8.63a1.492 1.492 0 0 0 1.704.29l4.942-2.377A1.5 1.5 0 0 0 24 20.06V3.939a1.5 1.5 0 0 0-.85-1.352zm-5.146 14.861L10.826 12l7.178-5.448v10.896z' },
  { name: 'TypeScript', icon: 'M1.125 0C.502 0 0 .502 0 1.125v21.75C0 23.498.502 24 1.125 24h21.75c.623 0 1.125-.502 1.125-1.125V1.125C24 .502 23.498 0 22.875 0zm17.363 9.75c.612 0 1.154.037 1.627.111a6.38 6.38 0 0 1 1.306.34v2.458a3.95 3.95 0 0 0-.643-.361 5.093 5.093 0 0 0-.717-.26 5.453 5.453 0 0 0-1.426-.2c-.3 0-.573.028-.819.086a2.1 2.1 0 0 0-.623.242c-.17.104-.3.229-.393.374a.888.888 0 0 0-.14.49c0 .196.053.373.156.529.104.156.252.304.443.444s.423.276.696.41c.273.135.582.274.926.416.47.197.892.407 1.266.628.374.222.695.473.963.753.268.279.472.598.614.957.142.359.214.776.214 1.253 0 .657-.125 1.21-.373 1.656a3.033 3.033 0 0 1-1.012 1.085 4.38 4.38 0 0 1-1.487.596c-.566.12-1.163.18-1.79.18a9.916 9.916 0 0 1-1.84-.164 5.544 5.544 0 0 1-1.512-.493v-2.63a5.033 5.033 0 0 0 3.237 1.2c.333 0 .624-.03.872-.09.249-.06.456-.144.623-.25.166-.108.29-.234.373-.38a1.023 1.023 0 0 0-.074-1.089 2.12 2.12 0 0 0-.537-.5 5.597 5.597 0 0 0-.807-.444 27.72 27.72 0 0 0-1.007-.436c-.918-.383-1.602-.852-2.053-1.405-.45-.553-.676-1.222-.676-2.005 0-.614.123-1.141.369-1.582.246-.441.58-.804 1.004-1.089a4.494 4.494 0 0 1 1.47-.629 7.536 7.536 0 0 1 1.77-.201zm-15.113.188h9.563v2.166H9.506v9.646H6.789v-9.646H3.375z' },
  { name: 'JavaScript', icon: 'M0 0h24v24H0V0zm22.034 18.276c-.175-1.095-.888-2.015-3.003-2.873-.736-.345-1.554-.585-1.797-1.14-.091-.33-.105-.51-.046-.705.15-.646.915-.84 1.515-.66.39.12.75.42.976.9 1.034-.676 1.034-.676 1.755-1.125-.27-.42-.404-.601-.586-.78-.63-.705-1.469-1.065-2.834-1.034l-.705.089c-.676.165-1.32.525-1.71 1.005-1.14 1.291-.811 3.541.569 4.471 1.365 1.02 3.361 1.244 3.616 2.205.24 1.17-.87 1.545-1.966 1.41-.811-.18-1.26-.586-1.755-1.336l-1.83 1.051c.21.48.45.689.81 1.109 1.74 1.756 6.09 1.666 6.871-1.004.029-.09.24-.705.074-1.65l.046.067zm-8.983-7.245h-2.248c0 1.938-.009 3.864-.009 5.805 0 1.232.063 2.363-.138 2.711-.33.689-1.18.601-1.566.48-.396-.196-.597-.466-.83-.855-.063-.105-.11-.196-.127-.196l-1.825 1.125c.305.63.75 1.172 1.324 1.517.855.51 2.004.675 3.207.405.783-.226 1.458-.691 1.811-1.411.51-.93.402-2.07.397-3.346.012-2.054 0-4.109 0-6.179l.004-.056z' },
  { name: 'MongoDB', icon: 'M17.193 9.555c-1.264-5.58-4.252-7.414-4.573-8.115-.28-.394-.53-.954-.735-1.44-.036.495-.055.685-.523 1.184-.723.566-4.438 3.682-4.74 10.02-.282 5.912 4.27 9.435 4.888 9.884l.07.05A73.49 73.49 0 0111.91 24h.481c.114-1.032.284-2.056.51-3.07.417-.296.604-.463.85-.693a11.342 11.342 0 003.639-8.464c.01-.814-.103-1.662-.197-2.218zm-5.336 8.195s0-8.291.275-8.29c.213 0 .49 10.695.49 10.695-.381-.045-.765-1.76-.765-2.405z' },
  { name: 'PostgreSQL', icon: 'M23.5594 14.7228a.5269.5269 0 0 0-.0563-.1191c-.139-.2632-.4768-.3418-.7399-.2632-4.0246 1.2034-6.0768 1.2034-6.0768 1.2034s1.2034-2.0522 1.2034-6.0768c0-.2632-.0789-.5009-.2632-.7399a.5269.5269 0 0 0-.1191-.0563.5295.5295 0 0 0-.2443-.0563c-4.0246 0-6.0768 0-6.0768 0s.0789-2.0522.0789-6.0768c0-.2632-.0789-.5009-.2632-.7399a.5269.5269 0 0 0-.1191-.0563C10.8726.0789 10.6354 0 10.3722 0c-.2632 0-.5009.0789-.7399.2632a.5269.5269 0 0 0-.0563.1191C9.5128 4.4269 9.5128 6.479 9.5128 6.479s-2.0522 0-6.0768 0c-.2632 0-.5009.0789-.7399.2632a.5269.5269 0 0 0-.0563.1191C2.5766 10.8726 2.5766 12.9248 2.5766 12.9248s-2.0522 0-6.0768 0c-.2632 0-.5009.0789-.7399.2632a.5269.5269 0 0 0-.0563.1191c-.0789.2632-.0789.5009 0 .7399.0789.2632.2632.5009.5009.7399.2632.2632.5009.3418.7399.3418h6.0768c4.0246 0 6.0768 0 6.0768 0s-.0789 2.0522-.0789 6.0768c0 .2632.0789.5009.2632.7399.0789.0789.1579.1579.2443.2443.2632.2632.5009.3418.7399.3418.2632 0 .5009-.0789.7399-.2632.0789-.0789.1579-.1579.2443-.2443.2632-.2632.3418-.5009.3418-.7399 0-4.0246 0-6.0768 0-6.0768s2.0522.0789 6.0768.0789c.2632 0 .5009-.0789.7399-.2632.0789-.0789.1579-.1579.2443-.2443.2632-.2632.3418-.5009.3418-.7399 0-.2632-.0789-.5009-.2632-.7399-.0789-.0789-.1579-.1579-.2443-.2443-.2632-.2632-.5009-.3418-.7399-.3418-4.0246 0-6.0768 0-6.0768 0s.0789-2.0522.0789-6.0768c0-.2632-.0789-.5009-.2632-.7399-.0789-.0789-.1579-.1579-.2443-.2443-.2632-.2632-.5009-.3418-.7399-.3418z' },
  { name: 'Redis', icon: 'M10.5 2.661l.54.997-1.797.644 2.409.218.748 1.246c.783-.233 1.679-.37 2.6-.37.922 0 1.818.137 2.601.37l.748-1.246 2.409-.218-1.797-.644.54-.997C18.487 1.935 16.773 1.5 15 1.5s-3.487.435-4.5 1.161zm-2.161 2.573l.641 1.072c1.216-.456 2.571-.708 3.97-.708 1.398 0 2.754.252 3.97.708l.641-1.072c-1.216-.456-2.571-.708-3.97-.708-1.398 0-2.754.252-3.97.708zm13.611 4.766c0-1.657-3.134-3-7-3s-7 1.343-7 3v9c0 1.657 3.134 3 7 3s7-1.343 7-3v-9z' },
  { name: 'Kubernetes', icon: 'M10.204 14.35l.007.01-.999 2.413a5.171 5.171 0 0 1-2.075-2.597l2.578-.437.004.005a.44.44 0 0 1 .484.606zm-.833-2.129a.44.44 0 0 0 .173-.756l.002-.011-1.575-2.003a5.189 5.189 0 0 0-.913 3.903l2.313-.133zm4.616-2.394l-2.313.133a.44.44 0 0 1-.173-.756l.002-.011 1.575-2.003a5.189 5.189 0 0 1 .913 3.903l-.004-.266zm-2.087 2.394l-.007-.01.999-2.413a5.171 5.171 0 0 0 2.075 2.597l-2.578.437-.004-.005a.44.44 0 0 0-.484-.606zm.833 2.129a.44.44 0 0 1-.173.756l-.002.011 1.575 2.003a5.189 5.189 0 0 1 .913-3.903l-2.313.133zm-4.616 2.394l2.313-.133a.44.44 0 0 0 .173.756l-.002.011-1.575 2.003a5.189 5.189 0 0 0-.913-3.903l.004.266z' },
  { name: 'AWS', icon: 'M6.763 10.036c0 .296.032.535.088.71.064.176.144.368.256.576.04.063.056.127.056.183 0 .08-.048.16-.152.24l-.503.335a.383.383 0 0 1-.208.072c-.08 0-.16-.04-.239-.112a2.47 2.47 0 0 1-.287-.375 6.18 6.18 0 0 1-.248-.471c-.622.734-1.405 1.101-2.347 1.101-.67 0-1.205-.191-1.596-.574-.391-.384-.59-.894-.59-1.533 0-.678.239-1.226.726-1.644.487-.417 1.133-.626 1.955-.626.272 0 .551.024.846.064.296.04.6.104.918.176v-.583c0-.607-.127-1.031-.375-1.277-.255-.246-.686-.367-1.3-.367-.28 0-.568.031-.863.103-.295.072-.583.16-.862.272a2.287 2.287 0 0 1-.28.104.488.488 0 0 1-.127.023c-.112 0-.168-.08-.168-.247v-.391c0-.128.016-.224.056-.28a.597.597 0 0 1 .224-.167c.279-.144.614-.264 1.005-.36a5.84 5.84 0 0 1 1.246-.136c.95 0 1.644.216 2.091.647.439.43.662 1.085.662 1.963v2.586zm-3.24 1.214c.263 0 .534-.048.822-.144.287-.096.543-.271.758-.51.128-.152.224-.32.272-.512.047-.191.08-.423.08-.694v-.335a6.66 6.66 0 0 0-.735-.136 6.02 6.02 0 0 0-.75-.048c-.535 0-.926.104-1.19.32-.263.215-.39.518-.39.917 0 .375.095.655.295.846.191.2.47.296.838.296zm6.41.862c-.144 0-.24-.024-.304-.08-.064-.048-.12-.16-.168-.311L7.586 5.55a1.398 1.398 0 0 1-.072-.32c0-.128.064-.2.191-.2h.783c.151 0 .255.025.31.08.065.048.113.16.16.312l1.342 5.284 1.245-5.284c.04-.16.088-.264.151-.312a.549.549 0 0 1 .32-.08h.638c.152 0 .256.025.32.08.063.048.12.16.151.312l1.261 5.348 1.381-5.348c.048-.16.104-.264.16-.312a.52.52 0 0 1 .311-.08h.743c.127 0 .2.065.2.2 0 .04-.009.08-.017.128a1.137 1.137 0 0 1-.056.2l-1.923 6.17c-.048.16-.104.263-.168.311a.51.51 0 0 1-.303.08h-.687c-.151 0-.255-.024-.32-.08-.063-.056-.119-.16-.15-.32l-1.238-5.148-1.23 5.14c-.04.16-.087.264-.15.32-.065.056-.177.08-.32.08zm10.256.215c-.415 0-.83-.048-1.229-.143-.399-.096-.71-.2-.918-.32-.128-.071-.215-.151-.247-.223a.563.563 0 0 1-.048-.224v-.407c0-.167.064-.247.183-.247.048 0 .096.008.144.024.048.016.12.048.2.08.271.12.566.215.878.279.319.064.63.096.95.096.502 0 .894-.088 1.165-.264a.86.86 0 0 0 .415-.758.777.777 0 0 0-.054-.451z' },
  { name: 'Azure', icon: 'M5.483 21.3H24L13.61 2.7h-3.172L5.483 21.3zM0 21.3h9.869l3.017-5.212H4.345L0 21.3z' },
  { name: 'GCP', icon: 'M12.19 2.38a9.344 9.344 0 0 0-9.234 6.893c.053-.02-.055.013 0 0-1.286.371-2.445 1.042-3.373 1.96-.927.917-1.597 2.076-1.969 3.363-.371 1.286-.427 2.653-.164 3.98.263 1.328.87 2.565 1.774 3.608.87 1.003 1.976 1.783 3.215 2.268 1.24.485 2.576.664 3.895.523 1.318-.141 2.576-.588 3.66-1.304.662-.425 1.249-.935 1.748-1.518.5-.583.91-1.23 1.226-1.918a9.344 9.344 0 0 0 9.234-6.893c-.053.02.055-.013 0 0 1.286-.371 2.445-1.042 3.373-1.96.927-.917 1.597-2.076 1.969-3.363.371-1.286.427-2.653.164-3.98-.263-1.328-.87-2.565-1.774-3.608-.87-1.003-1.976-1.783-3.215-2.268-1.24-.485-2.576-.664-3.895-.523-1.318.141-2.576.588-3.66 1.304-.662.425-1.249.935-1.748 1.518-.5.583-.91 1.23-1.226 1.918z' },
  { name: 'Jenkins', icon: 'M11.5 0c-.3 0-.5.2-.5.5v2c0 .3.2.5.5.5s.5-.2.5-.5v-2c0-.3-.2-.5-.5-.5zm6.5 2.8c-.2-.2-.5-.2-.7 0l-1.4 1.4c-.2.2-.2.5 0 .7.2.2.5.2.7 0l1.4-1.4c.2-.2.2-.5 0-.7zM5 2.8c-.2.2-.2.5 0 .7l1.4 1.4c.2.2.5.2.7 0 .2-.2.2-.5 0-.7L5.7 2.8c-.2-.2-.5-.2-.7 0zM11.5 5C8.5 5 6 7.5 6 10.5c0 2.6 1.8 4.8 4.2 5.4v2.6c0 .8.7 1.5 1.5 1.5h.6c.8 0 1.5-.7 1.5-1.5v-2.6c2.4-.6 4.2-2.8 4.2-5.4C17 7.5 14.5 5 11.5 5zm0 1c2.5 0 4.5 2 4.5 4.5S14 15 11.5 15 7 13 7 10.5 9 6 11.5 6zM2.5 10c-.3 0-.5.2-.5.5s.2.5.5.5h2c.3 0 .5-.2.5-.5s-.2-.5-.5-.5h-2zm17 0c-.3 0-.5.2-.5.5s.2.5.5.5h2c.3 0 .5-.2.5-.5s-.2-.5-.5-.5h-2zM6.4 16.2c-.2-.2-.5-.2-.7 0-.2.2-.2.5 0 .7l1.4 1.4c.2.2.5.2.7 0 .2-.2.2-.5 0-.7l-1.4-1.4zm11.2 0l-1.4 1.4c-.2.2-.2.5 0 .7.2.2.5.2.7 0l1.4-1.4c.2-.2.2-.5 0-.7-.2-.2-.5-.2-.7 0z' },
  { name: 'CircleCI', icon: 'M8.963 12c0-1.584 1.284-2.855 2.855-2.855 1.572 0 2.856 1.284 2.856 2.855 0 1.572-1.284 2.856-2.856 2.856-1.571 0-2.855-1.284-2.855-2.856zm2.855-12C6.215 0 1.522 3.84.19 9.025c-.01.036-.01.07-.01.12 0 .313.252.576.575.576H5.59c.23 0 .433-.132.517-.323.997-2.16 3.18-3.672 5.711-3.672 3.46 0 6.29 2.83 6.29 6.29 0 3.461-2.83 6.291-6.29 6.291-2.532 0-4.714-1.512-5.71-3.672-.085-.19-.289-.323-.518-.323H.755c-.323 0-.575.264-.575.576 0 .05 0 .084.01.12C1.522 20.16 6.214 24 11.818 24c6.624 0 12-5.376 12-12s-5.376-12-12-12z' },
  { name: 'Terraform', icon: 'M1.5 4.5h6v10.5h-6V4.5zm7.5 0h6v10.5h-6V4.5zm7.5 0h6v10.5h-6V4.5zM9 16.5h6V27H9V16.5z' },
  { name: 'Ansible', icon: 'M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm6.5 14.5l-5.5-9-5.5 9h2.5l3-5 3 5h2.5z' },
  { name: 'Webpack', icon: 'M12 0l11 6.5v11L12 24 1 17.5v-11L12 0zm0 2.5L3 7.75v8.5l9 5.25 9-5.25v-8.5L12 2.5zm0 2.5l6.5 3.75v7.5L12 19.5l-6.5-3.75v-7.5L12 5z' },
  { name: 'Vite', icon: 'M14.746.887l-7.493 13.12L1.5 23.093l9.252-5.432L14.746.887zm8.254.887l-7.493 13.12L9.754 23.98l9.252-5.432L23 1.774z' },
  { name: 'Tailwind', icon: 'M12 6c-2.67 0-4.33 1.33-5 4 1-1.33 2.17-1.83 3.5-1.5.76.19 1.31.74 1.91 1.35.98 1 2.09 2.15 4.59 2.15 2.67 0 4.33-1.33 5-4-1 1.33-2.17 1.83-3.5 1.5-.76-.19-1.3-.74-1.91-1.35C15.61 7.15 14.5 6 12 6zM7 12c-2.67 0-4.33 1.33-5 4 1-1.33 2.17-1.83 3.5-1.5.76.19 1.3.74 1.91 1.35C8.39 16.85 9.5 18 12 18c2.67 0 4.33-1.33 5-4-1 1.33-2.17 1.83-3.5 1.5-.76-.19-1.3-.74-1.91-1.35C10.61 13.15 9.5 12 7 12z' },
  { name: 'Vue.js', icon: 'M2 3h3.5L12 15l6.5-12H22L12 21 2 3zm4.5 0h3L12 7.58 14.5 3h3L12 13.08 6.5 3z' },
  { name: 'Angular', icon: 'M12 2L2 6.5l1.5 13L12 24l8.5-4.5 1.5-13L12 2zm0 2.5l7 3-1 8.5-6 3.5-6-3.5-1-8.5 7-3zm0 2.5l-4.5 9h2l.9-2h3.2l.9 2h2L12 7zm0 3.5l1.3 2.5h-2.6L12 9.5z' },
  { name: 'Svelte', icon: 'M10.354 21.125a4.44 4.44 0 0 1-4.765-1.767 4.109 4.109 0 0 1-.703-3.107 3.898 3.898 0 0 1 .134-.522l.105-.321.287.21a7.21 7.21 0 0 0 2.186 1.092l.208.063-.02.208a1.253 1.253 0 0 0 .226.83 1.337 1.337 0 0 0 1.435.533 1.231 1.231 0 0 0 .343-.15l5.59-3.562a1.164 1.164 0 0 0 .524-.778 1.242 1.242 0 0 0-.211-.937 1.338 1.338 0 0 0-1.435-.533 1.23 1.23 0 0 0-.343.15l-2.133 1.36a4.078 4.078 0 0 1-1.135.499 4.44 4.44 0 0 1-4.765-1.766 4.108 4.108 0 0 1-.702-3.108 3.855 3.855 0 0 1 1.742-2.582l5.589-3.563a4.072 4.072 0 0 1 1.135-.499 4.44 4.44 0 0 1 4.765 1.767 4.109 4.109 0 0 1 .703 3.107 3.943 3.943 0 0 1-.134.522l-.105.321-.286-.21a7.204 7.204 0 0 0-2.187-1.093l-.208-.063.02-.207a1.255 1.255 0 0 0-.226-.831 1.337 1.337 0 0 0-1.435-.532 1.231 1.231 0 0 0-.343.15L8.62 9.368a1.162 1.162 0 0 0-.524.778 1.24 1.24 0 0 0 .211.937 1.338 1.338 0 0 0 1.435.533 1.235 1.235 0 0 0 .344-.15l2.132-1.36a4.067 4.067 0 0 1 1.135-.499 4.44 4.44 0 0 1 4.765 1.767 4.109 4.109 0 0 1 .703 3.107 3.857 3.857 0 0 1-1.742 2.583l-5.589 3.562a4.072 4.072 0 0 1-1.135.499z' },
  { name: 'Next.js', icon: 'M11.572 0c-.176 0-.31.001-.358.007a19.76 19.76 0 0 1-.364.033C7.443.346 4.25 2.185 2.228 5.012a11.875 11.875 0 0 0-2.119 5.243c-.096.659-.108.854-.108 1.747s.012 1.089.108 1.748c.652 4.506 3.86 8.292 8.209 9.695.779.25 1.6.422 2.534.525.363.04 1.935.04 2.299 0 1.611-.178 2.977-.577 4.323-1.264.207-.106.247-.134.219-.158-.02-.013-.9-1.193-1.955-2.62l-1.919-2.592-2.404-3.558a338.739 338.739 0 0 0-2.422-3.556c-.009-.002-.018 1.579-.023 3.51-.007 3.38-.01 3.515-.052 3.595a.426.426 0 0 1-.206.214c-.075.037-.14.044-.495.044H7.81l-.108-.068a.438.438 0 0 1-.157-.171l-.05-.106.006-4.703.007-4.705.072-.092a.645.645 0 0 1 .174-.143c.096-.047.134-.051.54-.051.478 0 .558.018.682.154.035.038 1.337 1.999 2.895 4.361a10760.433 10760.433 0 0 0 4.735 7.17l1.9 2.879.096-.063a12.317 12.317 0 0 0 2.466-2.163 11.944 11.944 0 0 0 2.824-6.134c.096-.66.108-.854.108-1.748 0-.893-.012-1.088-.108-1.747-.652-4.506-3.859-8.292-8.208-9.695a12.597 12.597 0 0 0-2.499-.523A33.119 33.119 0 0 0 11.573 0zm4.069 7.217c.347 0 .408.005.486.047a.473.473 0 0 1 .237.277c.018.06.023 1.365.018 4.304l-.006 4.218-.744-1.14-.746-1.14v-3.066c0-1.982.01-3.097.023-3.15a.478.478 0 0 1 .233-.296c.096-.05.13-.054.5-.054z' },
  { name: 'Bootstrap', icon: 'M11.77 11.24H9.956V8.202h2.152c1.17 0 1.834.522 1.834 1.466 0 1.008-.773 1.572-2.172 1.572zm.324 1.206H9.957v3.348h2.231c1.459 0 2.232-.585 2.232-1.685s-.795-1.663-2.326-1.663zM24 11.39v1.218c-1.128.108-1.817.944-2.226 2.268-.407 1.319-.463 2.937-.42 4.186.045 1.3-.968 2.5-2.337 2.5H4.985c-1.37 0-2.383-1.2-2.337-2.5.043-1.249-.013-2.867-.42-4.186-.41-1.324-1.1-2.16-2.228-2.268V11.39c1.128-.108 1.819-.944 2.227-2.268.408-1.319.464-2.937.42-4.186-.045-1.3.968-2.5 2.338-2.5h14.032c1.37 0 2.382 1.2 2.337 2.5-.043 1.249.013 2.867.42 4.186.409 1.324 1.098 2.16 2.226 2.268zm-7.927 2.817c0-1.354-.953-2.333-2.368-2.488v-.057c1.04-.169 1.856-1.135 1.856-2.213 0-1.537-1.213-2.538-3.062-2.538h-4.16v10.172h4.181c2.218 0 3.553-1.086 3.553-2.876z' },
  { name: 'Figma', icon: 'M8 24c2.208 0 4-1.792 4-4v-4H8c-2.208 0-4 1.792-4 4s1.792 4 4 4zM4 12c0-2.208 1.792-4 4-4h4v8H8c-2.208 0-4-1.792-4-4zM4 4c0-2.208 1.792-4 4-4h4v8H8C5.792 8 4 6.208 4 4zM12 0h4c2.208 0 4 1.792 4 4s-1.792 4-4 4h-4V0zM20 12c0 2.208-1.792 4-4 4s-4-1.792-4-4 1.792-4 4-4 4 1.792 4 4z' },
  { name: 'Postman', icon: 'M13.527.099C6.955-.744.942 3.9.099 10.473c-.843 6.572 3.8 12.584 10.373 13.428 6.573.843 12.587-3.801 13.428-10.374C24.744 6.955 20.101.943 13.527.099zm2.471 7.485a.855.855 0 0 0-.593.25l-4.453 4.453-.307-.307-.643-.643c4.389-4.376 5.18-4.418 5.996-3.753zm-4.863 4.861l4.44-4.44a.62.62 0 1 1 .847.903l-4.699 4.125-.588-.588zm.33.694l-1.1.238a.06.06 0 0 1-.067-.032.06.06 0 0 1 .01-.073l.645-.645.512.512zm-2.803-.459l1.172-1.172.879.878-1.979.426a.074.074 0 0 1-.085-.039.072.072 0 0 1 .013-.093zm-3.646 6.058a.076.076 0 0 1-.069-.083.077.077 0 0 1 .022-.046h.002l.946-.946 1.222 1.222-2.123-.147zm2.425-1.256a.228.228 0 0 0-.117.256l.203.865a.125.125 0 0 1-.211.117h-.003l-.934-.934-.294-.295 3.762-3.758 1.82-.393.874.874c-1.255 1.102-2.971 2.201-5.1 3.268zm5.279-3.428h-.002l-.839-.839 4.699-4.125a.952.952 0 0 0 .119-.127c-.148 1.345-2.029 3.245-3.977 5.091zm3.657-6.46l-.003-.002a1.822 1.822 0 0 1 2.459-2.684l-1.61 1.613a.119.119 0 0 0 0 .169l1.247 1.247a1.817 1.817 0 0 1-2.093-.343zm2.578 0a1.714 1.714 0 0 1-.271.218h-.001l-1.207-1.207 1.533-1.533c.661.72.637 1.832-.054 2.522zM18.855 6.05a.143.143 0 0 0-.053.157.416.416 0 0 1-.053.45.14.14 0 0 0 .023.197.141.141 0 0 0 .084.03.14.14 0 0 0 .106-.05.691.691 0 0 0 .087-.751.138.138 0 0 0-.194-.033z' },
];

const features = [
  { title: 'AI that understands your codebase', desc: 'Buildr indexes your entire codebase and understands the context of your project to provide intelligent suggestions.', color: 'bg-blue-accent' },
  { title: 'Pair program with AI', desc: 'Chat with an AI that can see your code, make edits, and help you debug issues in real-time. Requires full control of your GitHub repository or VS Code integration to enable real-time code access and editing capabilities.', color: 'bg-green-accent' },
  { title: 'Smart autocomplete', desc: 'Get intelligent code completions that understand your coding patterns and project structure.', color: 'bg-purple-500' },
  { title: 'Privacy first', desc: 'Your code stays private. We use SOC 2 compliant infrastructure and never train on your code.', color: 'bg-red-500' },
  { title: 'Built for teams', desc: 'Share AI conversations, collaborate on code, and maintain consistency across your team.', color: 'bg-yellow-500' },
  { title: 'Import from anywhere', desc: 'Seamlessly import your existing projects from VS Code, GitHub, or any other editor.', color: 'bg-indigo-500' },
];

const pricingPlans = [
  { name: 'STARTER', price: '50', yearlyPrice: '40', period: 'per month', features: ['Up to 10 projects', 'Basic AI assistance', '48-hour support response', 'Limited API access', 'Community support'], description: 'Perfect for individuals', buttonText: 'Start Free Trial', href: '/signup', isPopular: false },
  { name: 'PROFESSIONAL', price: '99', yearlyPrice: '79', period: 'per month', features: ['Unlimited projects', 'Advanced AI features', '24-hour support response', 'Full API access', 'Priority support', 'Team collaboration', 'Custom integrations'], description: 'For growing teams', buttonText: 'Get Started', href: '/signup', isPopular: true },
  { name: 'ENTERPRISE', price: '299', yearlyPrice: '239', period: 'per month', features: ['Everything in Professional', 'Custom solutions', 'Dedicated account manager', '1-hour support response', 'SSO Authentication', 'Advanced security', 'Custom contracts', 'SLA agreement'], description: 'For large organizations', buttonText: 'Contact Sales', href: '/contact', isPopular: false },
];

const testimonials = [
  { name: 'Sarah Chen', role: 'Senior Developer at Stripe', text: 'Buildr has completely transformed how I write code. The AI suggestions are incredibly accurate and save me hours every day.', img: 'https://wallpapers.com/images/hd/beautiful-black-woman-with-pearl-hoops-ou34ar6z2o4pnb0d.jpg' },
  { name: 'Marcus Johnson', role: 'CTO at TechStart', text: 'The best coding experience I\'ve ever had. Buildr understands context better than any other AI tool I\'ve used.', img: 'https://tse4.mm.bing.net/th/id/OIP.EFYqbt4p23dfPwyUMv_SpQHaF7?rs=1&pid=ImgDetMain&o=7&rm=3' },
  { name: 'Victor Rodriguez', role: 'Full Stack Developer', text: 'I can\'t imagine coding without Buildr anymore. It\'s like having a senior developer pair programming with me 24/7.', img: 'https://tse4.mm.bing.net/th/id/OIP.jm26IDIizTFNWcTShM_V3QHaHa?rs=1&pid=ImgDetMain&o=7&rm=3' },
];

export default function Index() {
  const [yearly, setYearly] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      const target = document.querySelector('.typing-line .text-green-300');
      const codeLines = document.querySelectorAll('.code-line.opacity-0');
      if (!target) return;
      target.textContent = '';
      let charIndex = 0;
      const textToType = 'RandomForestClassifier(n_estimators=100)';
      function typeText() {
        if (charIndex < textToType.length) {
          target.textContent += textToType.charAt(charIndex);
          charIndex++;
          setTimeout(typeText, 80);
        } else {
          setTimeout(() => {
            codeLines.forEach((line, index) => {
              setTimeout(() => { line.style.opacity = '1'; }, index * 200);
            });
          }, 500);
        }
      }
      setTimeout(typeText, 1500);
    }, 15000);
    return () => clearInterval(timer);
  }, []);

  return (
    <>
      <Head>
        <title>BuildrsHQ | Ship Better Code, Faster</title>
        <link rel="icon" href="/buildrs.png" />
        <meta name="google-site-verification" content="......." />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
        <style>{`
          * { font-family: 'Space Grotesk', sans-serif; }
          body { overflow-x: hidden; }
          .cube-container { position: fixed; width: 120px; height: 120px; perspective: 1000px; z-index: 0; pointer-events: none; }
          .cube { width: 100%; height: 100%; position: relative; transform-style: preserve-3d; animation: rotate3d 20s infinite linear; }
          .cube-face { position: absolute; width: 120px; height: 120px; opacity: 0.15; border: 2px solid rgba(255,255,255,0.1); }
          .cube-face-front { transform: rotateY(0deg) translateZ(60px); }
          .cube-face-back { transform: rotateY(180deg) translateZ(60px); }
          .cube-face-right { transform: rotateY(90deg) translateZ(60px); }
          .cube-face-left { transform: rotateY(-90deg) translateZ(60px); }
          .cube-face-top { transform: rotateX(90deg) translateZ(60px); }
          .cube-face-bottom { transform: rotateX(-90deg) translateZ(60px); }
          .cube-container-1 { top: 10%; left: 5%; animation: float1 15s infinite ease-in-out; }
          .cube-container-1 .cube-face { background: linear-gradient(135deg, rgba(59,130,246,0.3), rgba(16,185,129,0.3)); }
          .cube-container-2 { top: 60%; right: 8%; animation: float2 18s infinite ease-in-out; }
          .cube-container-2 .cube-face { background: linear-gradient(135deg, rgba(16,185,129,0.3), rgba(139,92,246,0.3)); }
          .cube-container-3 { bottom: 15%; left: 12%; animation: float3 22s infinite ease-in-out; }
          .cube-container-3 .cube-face { background: linear-gradient(135deg, rgba(139,92,246,0.3), rgba(59,130,246,0.3)); }
          @keyframes rotate3d { 0% { transform: rotateX(0deg) rotateY(0deg) rotateZ(0deg); } 100% { transform: rotateX(360deg) rotateY(360deg) rotateZ(360deg); } }
          @keyframes float1 { 0%,100% { transform: translateY(0) translateX(0); } 50% { transform: translateY(-60px) translateX(30px); } }
          @keyframes float2 { 0%,100% { transform: translateY(0) translateX(0); } 50% { transform: translateY(40px) translateX(-30px); } }
          @keyframes float3 { 0%,100% { transform: translateY(0) translateX(0); } 50% { transform: translateY(-50px) translateX(40px); } }
          .content-wrapper { position: relative; z-index: 1; }
          .cursor-blink { animation: blink 1s infinite; color: #3b82f6; }
          @keyframes blink { 0%,49% { opacity: 1; } 50%,100% { opacity: 0; } }
          .code-line { transition: opacity 0.5s ease-in-out; }
          .ai-popup { animation: slideIn 0.5s ease-out forwards; animation-delay: 3s; }
          @keyframes slideIn { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }
          .suggestion-line { animation: fadeIn 0.5s ease-in forwards; animation-delay: 4s; }
          @keyframes fadeIn { from { opacity: 0; } to { opacity: 0.7; } }
          .modern-header { position: fixed; top: 20px; left: 20px; right: 20px; z-index: 50; backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); background-color: rgba(26,31,54,0.85); border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; box-shadow: 0 8px 32px rgba(0,0,0,0.3); transition: all 0.3s ease; }
          .modern-header:hover { box-shadow: 0 12px 40px rgba(0,0,0,0.4); }
          @media (max-width: 640px) { .modern-header { top: 10px; left: 10px; right: 10px; border-radius: 12px; } }
          .logo-glow { box-shadow: 0 10px 25px -5px rgba(59,130,246,0.5); }
          .nav-link { position: relative; transition: all 0.2s ease; }
          .nav-link::after { content: ''; position: absolute; bottom: -2px; left: 50%; width: 0; height: 2px; background: linear-gradient(to right, #3b82f6, #8b5cf6); transition: all 0.3s ease; transform: translateX(-50%); }
          .nav-link:hover::after { width: 80%; }
          .cta-button { background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%); transition: all 0.3s ease; }
          .cta-button:hover { box-shadow: 0 10px 25px -5px rgba(59,130,246,0.5); transform: scale(1.05); }
          .integration-scroll { overflow: hidden; position: relative; width: 100%; mask-image: linear-gradient(to right, transparent, black 10%, black 90%, transparent); -webkit-mask-image: linear-gradient(to right, transparent, black 10%, black 90%, transparent); }
          .integration-track { display: flex; gap: 4rem; animation: scroll 30s linear infinite; width: fit-content; }
          .integration-item { flex: 0 0 auto; min-width: 120px; }
          @keyframes scroll { from { transform: translateX(0); } to { transform: translateX(calc(-50% - 2rem)); } }
          .integration-scroll:hover .integration-track { animation-play-state: paused; }
        `}</style>
      </Head>

      <div className="min-h-screen bg-navy text-white overflow-x-hidden">
        <div className="cube-container cube-container-1"><div className="cube"><div className="cube-face cube-face-front"/><div className="cube-face cube-face-back"/><div className="cube-face cube-face-right"/><div className="cube-face cube-face-left"/><div className="cube-face cube-face-top"/><div className="cube-face cube-face-bottom"/></div></div>
        <div className="cube-container cube-container-2"><div className="cube"><div className="cube-face cube-face-front"/><div className="cube-face cube-face-back"/><div className="cube-face cube-face-right"/><div className="cube-face cube-face-left"/><div className="cube-face cube-face-top"/><div className="cube-face cube-face-bottom"/></div></div>
        <div className="cube-container cube-container-3"><div className="cube"><div className="cube-face cube-face-front"/><div className="cube-face cube-face-back"/><div className="cube-face cube-face-right"/><div className="cube-face cube-face-left"/><div className="cube-face cube-face-top"/><div className="cube-face cube-face-bottom"/></div></div>

        <div className="content-wrapper">
          <header className="modern-header">
            <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-10">
              <div className="flex justify-between items-center h-16">
                <Link href="/" className="flex items-center space-x-3 group">
                  <div className="w-20 h-10 flex items-center justify-center transform">
                    <img src="/buildrs.png" alt="BuildrsHQ" className="w-20 h-16" />
                  </div>
                  <span className="text-xl font-bold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">BuildrsHQ</span>
                </Link>
                <nav className="hidden lg:flex items-center space-x-1">
                  <Link href="/features" className="nav-link px-4 py-2 rounded-lg text-gray-300 hover:text-white hover:bg-white/5">Features</Link>
                  <Link href="/pricing" className="nav-link px-4 py-2 rounded-lg text-gray-300 hover:text-white hover:bg-white/5">Pricing</Link>
                  <Link href="/blog" className="nav-link px-4 py-2 rounded-lg text-gray-300 hover:text-white hover:bg-white/5">Blog</Link>
                  <Link href="/changelog" className="nav-link px-4 py-2 rounded-lg text-gray-300 hover:text-white hover:bg-white/5">Changelog</Link>
                </nav>
                <div className="hidden lg:flex items-center space-x-3">
                  <Link href="/sign_in" className="px-6 py-2.5 rounded-lg text-white hover:bg-white/5 transition-all duration-200 font-medium">Sign In</Link>
                  <Link href="/signup" className="cta-button px-6 py-2.5 rounded-lg text-white font-medium">Start Free Trial</Link>
                </div>
                <button type="button" onClick={() => setMenuOpen((v) => !v)} className="lg:hidden p-2 rounded-lg hover:bg-white/5 transition-colors" aria-label="Toggle mobile menu">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"/></svg>
                </button>
              </div>
            </div>
            <div className={`${menuOpen ? 'block' : 'hidden'} lg:hidden border-t border-white/10 bg-navy-dark/95 backdrop-blur-lg`}>
              <div className="max-w-7xl mx-auto px-4 py-4 space-y-2">
                <Link href="/features" className="block px-4 py-3 rounded-lg text-gray-300 hover:text-white hover:bg-white/5 transition-all">Features</Link>
                <Link href="/pricing" className="block px-4 py-3 rounded-lg text-gray-300 hover:text-white hover:bg-white/5 transition-all">Pricing</Link>
                <Link href="/blog" className="block px-4 py-3 rounded-lg text-gray-300 hover:text-white hover:bg-white/5 transition-all">Blog</Link>
                <Link href="/changelog" className="block px-4 py-3 rounded-lg text-gray-300 hover:text-white hover:bg-white/5 transition-all">Changelog</Link>
                <div className="pt-4 space-y-2">
                  <Link href="/sign_in" className="block px-4 py-3 rounded-lg text-center text-white hover:bg-white/5 transition-all font-medium">Sign In</Link>
                  <Link href="/signup" className="block px-4 py-3 rounded-lg text-center cta-button text-white font-medium">Start Free Trial</Link>
                </div>
              </div>
            </div>
          </header>

          <div className="h-28" />

          <section className="py-20 px-4 sm:px-6 lg:px-8">
            <div className="max-w-4xl mx-auto text-center">
              <h1 className="text-5xl md:text-6xl font-bold mb-6">Ship Better Code, Faster</h1>
              <p className="text-xl text-gray-300 mb-8 max-w-2xl mx-auto">The AI-first code editor. Built to make you extraordinarily productive, Buildr is the best way to code with AI.</p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
                <Link href="/signup" className="bg-white text-navy px-8 py-3 rounded-md font-medium inline-block text-center hover:bg-gray-100 transition">Start Free Trial</Link>
                <Link href="/demo" className="border border-gray-600 px-8 py-3 rounded-md font-medium hover:bg-gray-800 inline-block text-center transition">Schedule a Demo</Link>
              </div>
              <div className="bg-navy-light rounded-lg p-6 max-w-4xl mx-auto shadow-2xl border border-gray-700">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex space-x-2"><div className="w-3 h-3 bg-red-500 rounded-full"/><div className="w-3 h-3 bg-yellow-500 rounded-full"/><div className="w-3 h-3 bg-green-500 rounded-full"/></div>
                  <div className="text-sm text-gray-400 flex items-center space-x-2"><span>app.py</span><span className="w-3 h-3 bg-green-500 rounded-full"/></div>
                </div>
                <div className="bg-navy-dark rounded p-6 text-left font-mono text-sm overflow-hidden relative">
                  <div className="absolute left-6 top-6 text-gray-600 select-none space-y-1">{[...Array(12)].map((_, i) => (<div key={i}>{i + 1}</div>))}</div>
                  <div className="ml-8 space-y-1" id="codeContent">
                    <div className="code-line"><span className="text-purple-400">import</span> <span className="text-blue-300">numpy</span> <span className="text-purple-400">as</span> <span className="text-blue-300">np</span></div>
                    <div className="code-line"><span className="text-purple-400">from</span> <span className="text-blue-300">sklearn</span> <span className="text-purple-400">import</span> <span className="text-blue-300">datasets</span></div>
                    <div className="code-line">&nbsp;</div>
                    <div className="code-line"><span className="text-purple-400">def</span> <span className="text-yellow-300">train_model</span><span className="text-gray-400">(</span><span className="text-orange-300">data</span><span className="text-gray-400">):</span></div>
                    <div className="code-line"><span className="ml-4 text-gray-500"># AI-powered code completion</span></div>
                    <div className="code-line typing-line"><span className="ml-4 text-blue-300">model</span> <span className="text-purple-400">=</span> <span className="text-green-300"></span><span className="cursor-blink">|</span></div>
                    <div className="code-line opacity-0 suggestion-line"><span className="ml-4 text-gray-500 italic">? RandomForestClassifier(n_estimators=100)</span></div>
                    <div className="code-line opacity-0"><span className="ml-4 text-blue-300">model</span><span className="text-gray-400">.</span><span className="text-yellow-300">fit</span><span className="text-gray-400">(</span><span className="text-orange-300">data</span><span className="text-gray-400">)</span></div>
                    <div className="code-line opacity-0"><span className="ml-4 text-purple-400">return</span> <span className="text-blue-300">model</span></div>
                    <div className="code-line opacity-0">&nbsp;</div>
                  </div>
                  <div className="ai-popup absolute right-6 top-20 bg-gray-800 border border-blue-500 rounded-lg p-4 shadow-xl opacity-0">
                    <div className="flex items-center space-x-2 mb-2"><div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"/><span className="text-xs text-blue-400 font-semibold">AI Assistant</span></div>
                    <p className="text-xs text-gray-300">Suggesting optimal model...</p>
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between text-xs text-gray-500">
                  <div className="flex items-center space-x-4"><span className="flex items-center space-x-1"><span className="w-2 h-2 bg-green-500 rounded-full"/><span>Python 3.11</span></span><span>UTF-8</span><span>Ln 6, Col 23</span></div>
                  <div className="flex items-center space-x-2"><span className="w-2 h-2 bg-blue-400 rounded-full"/><span className="text-blue-400">AI Active</span></div>
                </div>
              </div>
            </div>
          </section>

          <section className="py-16 px-4 sm:px-6 lg:px-8">
            <div className="max-w-7xl mx-auto">
              <h2 className="text-3xl font-bold text-center mb-12">Everything you need to build better software</h2>
              <p className="text-center text-gray-300 mb-16 max-w-2xl mx-auto">Buildr is designed from the ground up to be the most productive developer environment.</p>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                {features.map((feature, i) => (
                  <div key={i} className="bg-navy-light p-6 rounded-lg">
                    <div className={`w-12 h-12 ${feature.color} rounded-lg mb-4 flex items-center justify-center`}>
                      <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg>
                    </div>
                    <h3 className="text-xl font-semibold mb-3">{feature.title}</h3>
                    <p className="text-gray-300">{feature.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="py-16 px-4 sm:px-6 lg:px-8 bg-navy-dark">
            <div className="max-w-7xl mx-auto">
              <div className="grid lg:grid-cols-2 gap-12 items-center">
                <div>
                  <h2 className="text-3xl font-bold mb-6">Code with confidence</h2>
                  <p className="text-gray-300 mb-8">Buildr's AI understands your codebase and can help you write, edit, and debug code faster than ever before.</p>
                  <ul className="space-y-4">
                    {['AI-powered code generation and editing', 'Intelligent debugging and error detection', 'Context-aware suggestions and refactoring'].map((item, idx) => (
                      <li key={idx} className="flex items-start space-x-3"><div className="w-6 h-6 bg-green-accent rounded-full flex items-center justify-center mt-0.5"><svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg></div><span className="text-gray-300">{item}</span></li>
                    ))}
                  </ul>
                </div>
                <div className="bg-navy rounded-lg p-6">
                  <div className="bg-navy-dark rounded-lg p-4 font-mono text-sm">
                    <div className="flex items-center justify-between mb-4"><div className="flex space-x-2"><div className="w-3 h-3 bg-red-500 rounded-full"/><div className="w-3 h-3 bg-yellow-500 rounded-full"/><div className="w-3 h-3 bg-green-500 rounded-full"/></div><span className="text-gray-400 text-xs">app.py</span></div>
                    <div className="space-y-1">
                      {[['1','text-purple-400','import'],['2','text-purple-400','from'],['3',null,null],['4','text-white','app ='],['5',null,null],['6','text-purple-400','@app.route'],['7','text-purple-400','def'],['8','text-transparent',' sss '],['9','text-purple-400','return'],].map(([num, color, text], idx) => (
                        <div key={idx} className="flex"><span className="text-gray-500 w-8">{num}</span>{color && text && <span className={color}>{text}</span>}</div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="py-16 px-4 sm:px-6 lg:px-8 bg-navy-dark">
            <div className="max-w-7xl mx-auto text-center">
              <h2 className="text-3xl font-bold mb-12">Integrates with your favorite tools</h2>
              <div className="integration-scroll mb-16">
                <div className="integration-track">
                  {integrations.map((item, i) => (
                    <div key={i} className="integration-item flex flex-col items-center space-y-2">
                      <div className="w-16 h-16 bg-navy-light rounded-lg flex items-center justify-center"><svg className="w-8 h-8 text-gray-300" fill="currentColor" viewBox="0 0 24 24"><path d={item.icon}/></svg></div>
                      <span className="text-sm text-gray-300">{item.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-navy to-navy-dark">
            <div className="max-w-7xl mx-auto">
              <div id="pricing-component" className="pricing-container">
                <div className="grid md:grid-cols-3 gap-8">
                  {pricingPlans.map((plan, i) => (
                    <div key={i} className={`relative rounded-2xl border p-8 ${plan.isPopular ? 'border-blue-500 bg-navy-light' : 'border-gray-700 bg-[#1a2332]'}`}>
                      {plan.isPopular && <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-500 text-white text-xs font-semibold px-3 py-1 rounded-full">Most Popular</span>}
                      <h3 className="text-xl font-bold mb-2">{plan.name}</h3>
                      <p className="text-gray-400 mb-6">{plan.description}</p>
                      <div className="mb-6"><span className="text-4xl font-bold">${yearly ? plan.yearlyPrice : plan.price}</span><span className="text-gray-400">/{plan.period}</span></div>
                      <Link href={plan.href} className={`block text-center py-3 rounded-lg font-medium mb-6 ${plan.isPopular ? 'cta-button text-white' : 'border border-gray-600 text-white hover:bg-white/5'}`}>{plan.buttonText}</Link>
                      <ul className="space-y-3 text-gray-300">
                        {plan.features.map((feature, idx) => (<li key={idx} className="flex items-center gap-3"><svg className="w-4 h-4 text-green-400" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg>{feature}</li>))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="py-16 px-4 sm:px-6 lg:px-8">
            <div className="max-w-7xl mx-auto">
              <h2 className="text-3xl font-bold text-center mb-12">Loved by developers worldwide</h2>
              <div className="grid md:grid-cols-3 gap-8">
                {testimonials.map((t, i) => (
                  <div key={i} className="bg-navy-light p-6 rounded-lg">
                    <div className="flex items-center mb-4"><img src={t.img} className="w-12 h-12 rounded-full object-cover mr-3 shadow-lg" alt={t.name}/><div><div className="font-semibold">{t.name}</div><div className="text-sm text-gray-400">{t.role}</div></div></div>
                    <p className="text-gray-300">"{t.text}"</p>
                    <div className="flex mt-4"><span className="text-yellow-400">★★★★★</span></div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="py-16 px-4 sm:px-6 lg:px-8 bg-navy-dark">
            <div className="max-w-7xl mx-auto">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
                <div><div className="text-4xl font-bold text-blue-accent mb-2">50M+</div><div className="text-gray-300">Lines of code generated</div></div>
                <div><div className="text-4xl font-bold text-green-accent mb-2">99.9%</div><div className="text-gray-300">Uptime</div></div>
                <div><div className="text-4xl font-bold text-purple-400 mb-2">24/7</div><div className="text-gray-300">Support</div></div>
                <div><div className="text-4xl font-bold text-orange-400 mb-2">SOC 2</div><div className="text-gray-300">Compliant</div></div>
              </div>
            </div>
          </section>

          <section className="py-20 px-4 sm:px-6 lg:px-8 bg-navy-dark">
            <div className="max-w-4xl mx-auto text-center">
              <h2 className="text-4xl font-bold mb-6">Ready to ship better code?</h2>
              <p className="text-xl text-gray-300 mb-8">Join thousands of developers who are already coding faster with Buildr.</p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link href="/demo" className="border border-gray-600 px-8 py-3 rounded-md font-medium text-lg hover:bg-gray-800 inline-block text-center">Book a demo</Link>
              </div>
            </div>
          </section>

          <footer className="bg-navy-dark border-t border-gray-700 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-7xl mx-auto">
              <div className="grid md:grid-cols-4 gap-8">
                <div>
                  <div className="flex items-center space-x-2 mb-4"><div className="w-8 h-8 bg-transparent-accent rounded"><img src="/buildrs.png" alt=""/></div><span className="text-xl font-semibold">BuildrsHQ</span></div>
                  <p className="text-gray-400 mb-4">The AI-first code editor built to make you extraordinarily productive.</p>
                </div>
                <div><h4 className="font-semibold mb-4">Product</h4><ul className="space-y-2 text-gray-400"><li><Link href="/features" className="hover:text-white">Features</Link></li><li><Link href="/pricing" className="hover:text-white">Pricing</Link></li><li><Link href="/changelog" className="hover:text-white">Changelog</Link></li></ul></div>
                <div><h4 className="font-semibold mb-4">Company</h4><ul className="space-y-2 text-gray-400"><li><Link href="/about" className="hover:text-white">About</Link></li><li><Link href="/blog" className="hover:text-white">Blog</Link></li><li><Link href="/careers" className="hover:text-white">Careers</Link></li><li><Link href="/contact" className="hover:text-white">Contact</Link></li></ul></div>
                <div><h4 className="font-semibold mb-4">Resources</h4><ul className="space-y-2 text-gray-400"><li><Link href="/docs" className="hover:text-white">Documentation</Link></li><li><Link href="/support" className="hover:text-white">Support</Link></li><li><Link href="/privacy" className="hover:text-white">Privacy</Link></li><li><Link href="/terms" className="hover:text-white">Terms</Link></li></ul></div>
              </div>
              <div className="border-t border-gray-700 mt-8 pt-8 text-center text-gray-400"><p>&copy; 2026 BuildrsHQ. All rights reserved.</p></div>
            </div>
          </footer>
        </div>
      </div>
    </>
  );
}
