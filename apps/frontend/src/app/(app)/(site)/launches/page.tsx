export const dynamic = 'force-dynamic';
import { LaunchesComponent } from '@gitroom/frontend/components/launches/launches.component';
import { Metadata } from 'next';
import { isGeneralServerSide } from '@gitroom/helpers/utils/is.general.server.side';
import { brandNameServerSide } from '@gitroom/helpers/utils/brand';
export const metadata: Metadata = {
  title: `${
    brandNameServerSide() + (isGeneralServerSide() ? ' Calendar' : ' Launches')
  }`,
  description: '',
};
export default async function Index() {
  return <LaunchesComponent />;
}
