import Link from "next/link";
import { DeviceApproval } from "../../features/auth/device-approval";
export default function ConnectPage() {
  return (
    <>
      <DeviceApproval />
      <p className="small text-center">
        <Link href="/entrar">Entrar ou criar conta antes de conectar</Link>
      </p>
    </>
  );
}
