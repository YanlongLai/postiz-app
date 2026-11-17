import { MediaLayoutComponent } from '@gitroom/frontend/components/new-layout/layout.media.component';
import { Metadata } from 'next';
import { brandNameServerSide } from '@gitroom/helpers/utils/brand';

export const metadata: Metadata = {
  title: `${brandNameServerSide()} Media`,
  description: '',
};

export default async function Page() {
  return <MediaLayoutComponent />;
}
