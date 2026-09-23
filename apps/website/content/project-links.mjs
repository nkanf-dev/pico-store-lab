import project from '../../../project-links.json' with { type: 'json' };

export const githubOwner = project.githubOwner;
export const repositoryUrl = `https://${project.githubHost}/${project.githubOwner}/${project.storeRepository}`;
export const bridgeRepositoryUrl = `https://${project.githubHost}/${project.githubOwner}/${project.bridgeRepository}`;
export const releasesUrl = `${repositoryUrl}/releases/latest`;
export const releaseDownloadUrl = `${releasesUrl}/download/`;
export const ownerUrl = `https://${project.githubHost}/${project.githubOwner}`;
export const registerUrl = project.picoRegistrationUrl;
export const websiteOrigin = project.websiteOrigin;
export const playerGuideUrl = `${repositoryUrl}#player-guide`;
export const picoStoreAppUrl = itemId => `https://store-global.picoxr.com/global/detail/1/${itemId}`;
