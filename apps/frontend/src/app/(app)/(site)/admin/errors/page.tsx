export const dynamic = 'force-dynamic';
import { AdminErrorsComponent } from '@gitroom/frontend/components/admin/admin-errors.component';
import { Metadata } from 'next';
import { brandNameServerSide } from '@gitroom/helpers/utils/brand';

export const metadata: Metadata = {
  title: `${brandNameServerSide()} Admin Errors`,
  description: '',
};

export default async function Page() {
  return (
    <div className="bg-newBgColorInner flex-1 flex-col flex p-[20px] gap-[12px]">
      <AdminErrorsComponent />
    </div>
  );
}
