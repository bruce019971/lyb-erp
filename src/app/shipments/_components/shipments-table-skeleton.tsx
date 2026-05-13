import { Skeleton } from "antd";

export default function ShipmentsTableSkeleton() {
  return (
    <div className="rounded-md bg-white p-6">
      <Skeleton active paragraph={{ rows: 10 }} />
    </div>
  );
}
