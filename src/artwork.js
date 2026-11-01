import { PROJECTS, SPECIALTIES } from './technology.js';

const projectIds = new Set(PROJECTS.map(project => project.id));
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

export function technologyArt(projectId) {
  return projectIds.has(projectId) ? `./assets/technology/${projectId}.jpg` : null;
}

// Resolve ties in the same stable order as the six specialties in the team sheet.
export function dominantSpecialty(team) {
  if (!team) return null;
  return SPECIALTIES.reduce((best, specialty) => !best || (team.specialties?.[specialty.id] ?? 0) > (team.specialties?.[best.id] ?? 0) ? specialty : best, null);
}

export function teamPortrait(team, size = 'small') {
  const specialty = dominantSpecialty(team);
  if (!specialty) return '';
  const variant = ['small', 'large', 'inline'].includes(size) ? size : 'small';
  return `<span class="team-portrait team-portrait--${variant}" data-specialty="${specialty.id}" title="${esc(specialty.name)}专长" aria-hidden="true"><img src="./assets/portraits/${specialty.id}.jpg" alt="" width="320" height="320" decoding="async"></span>`;
}

export const milestoneIcons = {
  foundations: 'ruler',
  ironworking: 'ingot',
  machine_age: 'gear',
  precision: 'caliper',
  powder_age: 'powder',
  steelworks: 'anvil',
  organization: 'army',
  rifled_arms: 'rifle',
};
