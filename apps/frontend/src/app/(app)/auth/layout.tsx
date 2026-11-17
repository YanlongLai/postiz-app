import { getT } from '@gitroom/react/translation/get.translation.service.backend';

export const dynamic = 'force-dynamic';
import { ReactNode } from 'react';
import loadDynamic from 'next/dynamic';
import { TestimonialComponent } from '@gitroom/frontend/components/auth/testimonial.component';
import { LogoTextComponent } from '@gitroom/frontend/components/ui/logo-text.component';
import { MantineWrapper } from '@gitroom/react/helpers/mantine.wrapper';
import { Toaster } from '@gitroom/react/toaster/toaster';
import { brandConfigServerSide } from '@gitroom/helpers/utils/brand';
const ReturnUrlComponent = loadDynamic(() => import('./return.url.component'));
export default async function AuthLayout({
  children,
}: {
  children: ReactNode;
}) {
  const t = await getT();
  const brand = brandConfigServerSide();

  return (
    <MantineWrapper>
      <Toaster />
      <div className="bg-[#0E0E0E] flex flex-1 p-[12px] gap-[12px] min-h-screen w-screen text-white">
        {/*<style>{`html, body {overflow-x: hidden;}`}</style>*/}
        <ReturnUrlComponent />
        <div className="flex flex-col py-[40px] px-[20px] flex-1 lg:w-[600px] lg:flex-none rounded-[12px] text-white p-[12px] bg-[#1A1919]">
          <div className="w-full max-w-[440px] mx-auto justify-center gap-[20px] h-full flex flex-col text-white">
            <LogoTextComponent />
            <div className="flex">{children}</div>
          </div>
        </div>
        {brand.whiteLabel ? (
          <div className="flex-1 pt-[88px] px-[40px] hidden lg:flex flex-col items-center text-center gap-[20px]">
            {!!brand.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={brand.logoUrl}
                alt=""
                width={96}
                height={96}
                className="rounded-[20px]"
              />
            )}
            <div className="text-[36px]">{brand.name}</div>
            {!!brand.tagline && (
              <div className="text-[18px] text-[#B8B8B8] max-w-[560px]">
                {brand.tagline}
              </div>
            )}
            {!!brand.homeUrl && (
              <a
                href={brand.homeUrl}
                className="text-[14px] text-[#B8B8B8] underline"
              >
                {brand.homeUrl.replace(/^https?:\/\//, '')}
              </a>
            )}
          </div>
        ) : (
          <div className="text-[36px] flex-1 pt-[88px] hidden lg:flex flex-col items-center">
            <div className="text-center">
              Over <span className="text-[42px] text-[#FC69FF]">20,000+</span>{' '}
              Entrepreneurs use
              <br />
              Postiz To Grow Their Social Presence
            </div>
            <TestimonialComponent />
          </div>
        )}
      </div>
    </MantineWrapper>
  );
}
