export const dynamic = 'force-dynamic';
import { Metadata } from 'next';
import { brandConfigServerSide } from '@gitroom/helpers/utils/brand';

export const metadata: Metadata = {
  title: `${brandConfigServerSide().name} - About & licences`,
  description: '',
};

// AGPL-3.0 section 13: users interacting with this instance over a network
// must be offered its corresponding source. White-label deployments keep this
// page (linked from Settings) so the licence and upstream notice stay
// reachable even though the upstream name is not shown in the main UI.
export default async function AboutPage() {
  const brand = brandConfigServerSide();
  return (
    <div className="bg-newBgColorInner flex-1 rounded-[12px] p-[20px] flex flex-col gap-[16px] text-[14px] max-w-[760px]">
      <h1 className="text-[24px] font-[600]">{brand.name}</h1>
      {!!brand.tagline && <p>{brand.tagline}</p>}
      <h2 className="text-[18px] font-[600] mt-[8px]">Open-source licences</h2>
      <p>
        This service is built on open-source software licensed under the GNU
        Affero General Public License v3.0 (AGPL-3.0), including the Postiz
        project (Copyright (C) Gitroom and contributors).
      </p>
      <p>
        The complete corresponding source code of the version running here,
        including all modifications, is available at{' '}
        <a href={brand.sourceUrl} className="underline" rel="noopener">
          {brand.sourceUrl}
        </a>
        . The licence text is at{' '}
        <a
          href="https://www.gnu.org/licenses/agpl-3.0.html"
          className="underline"
          rel="noopener"
        >
          gnu.org/licenses/agpl-3.0
        </a>
        .
      </p>
      {!!brand.homeUrl && (
        <p>
          <a href={brand.homeUrl} className="underline">
            {brand.homeUrl.replace(/^https?:\/\//, '')}
          </a>
        </p>
      )}
    </div>
  );
}
