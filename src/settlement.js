/** A complete town painting, revealed in terrain-shaped districts as construction proceeds. */
const COMPLETE_URL = new URL('../assets/estate-panorama-complete.png', import.meta.url).href;
const UNBUILT_URL = new URL('../assets/estate-panorama-unbuilt.png', import.meta.url).href;

// Coordinates belong to the shared 1586 × 992 painting, never to the viewport.
// Every investment builds an entire district; all built = the uncut original painting.
export const SETTLEMENT_DISTRICTS = [
  { id: 'workshop', name: '百工街巷', x: 22, y: 38,
    outline: 'M 73 430 L 104 362 L 145 310 L 252 264 L 347 216 L 448 215 L 604 239 L 659 310 L 710 352 L 756 390 L 779 425 L 770 469 L 699 483 L 638 489 L 606 499 L 551 488 L 522 476 L 506 478 L 487 489 L 431 501 L 372 493 L 326 476 L 274 485 L 194 507 L 112 481 Z' },
  { id: 'furnace', name: '山麓炉场', x: 85, y: 19,
    outline: 'M 718 388 L 721 295 L 734 213 L 772 150 L 833 91 L 947 44 L 1129 8 L 1299 14 L 1395 84 L 1472 165 L 1534 230 L 1560 337 L 1534 407 L 1493 454 L 1408 467 L 1300 465 L 1185 479 L 1085 448 L 1016 448 L 937 428 L 846 428 L 775 422 Z' },
  { id: 'machine_shop', name: '水轮军器厂', x: 28, y: 72,
    outline: 'M 146 583 L 158 510 L 207 487 L 277 478 L 325 447 L 349 364 L 388 350 L 480 398 L 539 422 L 608 436 L 645 456 L 725 454 L 780 426 L 836 424 L 889 455 L 924 521 L 950 570 L 955 643 L 919 705 L 866 749 L 795 775 L 714 763 L 624 747 L 560 735 L 477 718 L 403 691 L 324 678 L 246 660 L 186 630 Z' },
  { id: 'drill_ground', name: '演武营城', x: 89, y: 75,
    outline: 'M 900 712 L 918 644 L 934 579 L 1011 550 L 1098 513 L 1144 462 L 1225 453 L 1305 456 L 1378 482 L 1460 501 L 1556 519 L 1586 538 L 1586 801 L 1519 831 L 1432 852 L 1355 873 L 1282 888 L 1196 895 L 1116 867 L 1052 843 L 989 820 L 934 781 Z' },
];
const escapeHTML = value => String(value).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);

/** A landscape crop from the same panorama, not an isolated building token. */
export function facilityArt(id) {
  const district = SETTLEMENT_DISTRICTS.find(item => item.id === id);
  if (!district) return '';
  return `<span class="estate-district-thumb" style="--district-x:${district.x}%;--district-y:${district.y}%" aria-hidden="true"></span>`;
}

export function settlementScene(state, facilities = []) {
  const built = SETTLEMENT_DISTRICTS.filter(({ id }) => Number(state.facilities?.[id]) >= 1);
  const complete = built.length === SETTLEMENT_DISTRICTS.length;
  const names = Object.fromEntries(facilities.map(facility => [facility.id, facility.name]));
  const definitions = built.map(district => `<mask id="district-${district.id}" maskUnits="userSpaceOnUse" x="0" y="0" width="1586" height="992"><path d="${district.outline}" fill="white" filter="url(#district-edge)"/></mask>`).join('');
  const layers = complete ? '' : built.map(district => `<image class="estate-district" data-facility="${district.id}" href="${COMPLETE_URL}" width="1586" height="992" mask="url(#district-${district.id})" role="img" aria-label="${escapeHTML(names[district.id] || district.name)}，已建成"/>`).join('');
  const label = `皇家工业苑，已建成${built.length}片建筑群`;
  return `<div class="settlement-scene ${complete ? 'is-complete' : ''}" data-built-count="${built.length}" aria-label="${label}">
    <div class="estate-atmosphere" aria-hidden="true"></div>
    <div class="estate-panorama-frame">
      <svg class="estate-panorama" viewBox="0 0 1586 992" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${label}">
        <defs><filter id="district-edge" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="3"/></filter>${definitions}</defs>
        <image class="estate-base" href="${complete ? COMPLETE_URL : UNBUILT_URL}" width="1586" height="992"/>
        ${layers}
      </svg>
    </div>
  </div>`;
}
