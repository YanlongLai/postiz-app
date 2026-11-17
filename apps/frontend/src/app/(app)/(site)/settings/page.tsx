import { SettingsPopup } from '@gitroom/frontend/components/layout/settings.component';
export const dynamic = 'force-dynamic';
import { Metadata } from 'next';
import { brandNameServerSide } from '@gitroom/helpers/utils/brand';
export const metadata: Metadata = {
  title: `${brandNameServerSide()} Settings`,
  description: '',
};
export default async function Index(props: {
  searchParams: Promise<{
    code: string;
  }>;
}) {
  const searchParams = await props.searchParams;
  return <SettingsPopup />;
}
