/** A complete town painting, revealed in terrain-shaped districts as construction proceeds. */
const COMPLETE_URL = new URL('../assets/estate-panorama-complete.png', import.meta.url).href;
const UNBUILT_URL = new URL('../assets/estate-panorama-unbuilt.png', import.meta.url).href;

// Coordinates belong to the shared 1586 × 992 painting, never to the viewport.
// Each family occupies buildings already present in this painting. Crops are
// shared by its gallery entry and dossier; masks follow the surrounding terrain.
// All nine built = the uncut original painting, including its connecting streets.
export const SETTLEMENT_DISTRICTS = [
  // The two street-side compounds sit on opposite sides of the tree-lined lane.
  { id: 'workshop', name: '百工街巷', crop: { x: 18.75, y: 285.00, width: 472.50, height: 225.00 },
    outline: 'M 73 430 L 104 362 L 145 310 L 252 264 L 347 216 L 398 216 L 397 250 L 378 281 L 379 315 L 358 345 L 339 370 L 338 402 L 349 427 L 347 455 L 372 493 L 326 476 L 274 485 L 194 507 L 112 481 Z' },
  { id: 'metal_ammo_workshop', name: '街巷弹药工坊', crop: { x: 333.00, y: 230.00, width: 399.00, height: 190.00 },
    outline: 'M 398 216 L 448 215 L 604 239 L 659 310 L 710 352 L 671 371 L 622 379 L 584 371 L 542 374 L 501 363 L 457 355 L 417 333 L 379 315 L 378 281 L 397 250 Z' },
  // Furnace towers remain whole; the front terrace forms a separate forge yard.
  { id: 'furnace', name: '山麓高炉', crop: { x: 882.50, y: 35.00, width: 703.50, height: 335.00 },
    outline: 'M 1038 26 L 1129 8 L 1299 14 L 1395 84 L 1472 165 L 1534 230 L 1560 337 L 1534 407 L 1450 416 L 1394 392 L 1353 341 L 1302 319 L 1235 333 L 1177 311 L 1118 304 L 1080 308 L 1030 233 L 1009 173 Z' },
  { id: 'bronze_artillery', name: '西麓铸炮炉场', crop: { x: 691.25, y: 135.00, width: 577.50, height: 275.00 },
    outline: 'M 718 388 L 721 295 L 734 213 L 772 150 L 833 91 L 947 44 L 1038 26 L 1009 173 L 1030 233 L 1080 308 L 1041 319 L 1006 353 L 978 393 L 937 428 L 846 428 L 775 422 Z' },
  { id: 'steel_armory', name: '炉前锻钢工场', crop: { x: 1015.00, y: 278.57, width: 405.00, height: 192.86 },
    outline: 'M 937 428 L 978 393 L 1006 353 L 1041 319 L 1080 308 L 1118 304 L 1177 311 L 1235 333 L 1302 319 L 1353 341 L 1394 392 L 1450 416 L 1534 407 L 1493 454 L 1408 467 L 1300 465 L 1185 479 L 1085 448 L 1016 448 Z' },
  // The riverside works divide into the waterwheel hall, upper workshops and gantry.
  { id: 'machine_shop', name: '水轮机械厂', crop: { x: 136.50, y: 425.00, width: 672.00, height: 320.00 },
    outline: 'M 146 583 L 158 510 L 207 487 L 277 478 L 302 514 L 348 493 L 390 500 L 440 498 L 500 513 L 550 493 L 572 466 L 590 435 L 617 471 L 652 499 L 696 523 L 745 516 L 724 552 L 713 593 L 718 632 L 730 681 L 720 723 L 714 763 L 624 747 L 560 735 L 477 718 L 403 691 L 324 678 L 246 660 L 186 630 Z' },
  { id: 'arsenal', name: '河岸火器工场', crop: { x: 282.25, y: 345.00, width: 430.50, height: 205.00 },
    outline: 'M 277 478 L 325 447 L 349 364 L 388 350 L 440 365 L 483 376 L 538 374 L 598 385 L 640 417 L 690 387 L 755 388 L 780 426 L 745 454 L 725 480 L 745 516 L 696 523 L 652 499 L 617 471 L 590 435 L 572 466 L 550 493 L 500 513 L 440 498 L 390 500 L 348 493 L 302 514 Z' },
  { id: 'rifled_artillery', name: '水岸炮械工场', crop: { x: 560.00, y: 435.00, width: 525.00, height: 250.00 },
    outline: 'M 745 454 L 780 426 L 836 424 L 889 455 L 924 521 L 950 570 L 955 643 L 919 705 L 866 749 L 795 775 L 714 763 L 720 723 L 730 681 L 718 632 L 713 593 L 724 552 L 745 516 L 725 480 Z' },
  { id: 'drill_ground', name: '演武营城', crop: { x: 767.00, y: 460.00, width: 819.00, height: 390.00 },
    outline: 'M 900 712 L 918 644 L 934 579 L 1011 550 L 1098 513 L 1144 462 L 1225 453 L 1305 456 L 1378 482 L 1460 501 L 1556 519 L 1586 538 L 1586 801 L 1519 831 L 1432 852 L 1355 873 L 1282 888 L 1196 895 L 1116 867 L 1052 843 L 989 820 L 934 781 Z' },
];
const escapeHTML = value => String(value).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);

/** A landscape crop from the same panorama, not an isolated building token. */
export function facilityArt(id) {
  const district = SETTLEMENT_DISTRICTS.find(item => item.id === id);
  if (!district) return '';
  const { x, y, width, height } = district.crop;
  return `<svg class="estate-district-thumb" data-facility="${escapeHTML(id)}" viewBox="${x} ${y} ${width} ${height}" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false"><image href="${COMPLETE_URL}" x="0" y="0" width="1586" height="992"/></svg>`;
}

export function settlementScene(state, facilities = [], { revealFacilityId = null } = {}) {
  const built = SETTLEMENT_DISTRICTS.filter(({ id }) => Number(state.facilities?.[id]) >= 1);
  const complete = built.length === SETTLEMENT_DISTRICTS.length;
  const reveal = built.find(district => district.id === revealFacilityId) || null;
  const completeImmediately = complete && !reveal;
  const names = Object.fromEntries(facilities.map(facility => [facility.id, facility.name]));
  const definitions = built.map(district => `<mask id="district-${district.id}" maskUnits="userSpaceOnUse" x="0" y="0" width="1586" height="992"><path d="${district.outline}" fill="white" filter="url(#district-edge)"/></mask>`).join('');
  const surroundDefinition = complete && reveal ? `<mask id="district-surround" maskUnits="userSpaceOnUse" x="0" y="0" width="1586" height="992"><rect width="1586" height="992" fill="white"/><path d="${reveal.outline}" fill="black" filter="url(#district-edge)"/></mask>` : '';
  const surround = complete && reveal ? `<image class="estate-completion-surround" href="${COMPLETE_URL}" width="1586" height="992" mask="url(#district-surround)"/>` : '';
  // Draw the newest district last so only its construction fades in. The completed
  // landscape remains masked around it until the reveal has finished.
  const ordered = [...built.filter(district => district !== reveal), ...(reveal ? [reveal] : [])];
  const layers = completeImmediately ? '' : ordered.map(district => `<image class="estate-district${district === reveal ? ' is-revealing' : ''}" data-facility="${district.id}" href="${COMPLETE_URL}" width="1586" height="992" mask="url(#district-${district.id})" role="img" aria-label="${escapeHTML(names[district.id] || district.name)}，已建成"/>`).join('');
  const label = `皇家工业苑，已建成${built.length}片建筑群`;
  return `<div class="settlement-scene ${complete ? 'is-complete' : ''}" data-built-count="${built.length}" aria-label="${label}">
    <div class="estate-atmosphere" aria-hidden="true"></div>
    <div class="estate-panorama-frame">
      <svg class="estate-panorama" viewBox="0 0 1586 992" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${label}">
        <defs><filter id="district-edge" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="3"/></filter>${definitions}${surroundDefinition}</defs>
        <image class="estate-base" href="${completeImmediately ? COMPLETE_URL : UNBUILT_URL}" width="1586" height="992"/>
        ${surround}${layers}
      </svg>
    </div>
  </div>`;
}
