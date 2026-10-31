import { notFound } from "next/navigation";
import { CameraLoader } from "@/features/pareamento/camera-loader";
import { codigoSchema } from "@/features/pareamento/protocolo";

export const metadata = { title: "Celular como câmera" };

/** Página que o QR da TV abre no celular. Não pede login: o código de uso único é a chave. */
export default async function CameraPareada({ params }: { params: Promise<{ codigo: string }> }) {
  const codigo = codigoSchema.safeParse((await params).codigo.toUpperCase());
  if (!codigo.success) notFound();
  return <CameraLoader codigo={codigo.data} />;
}
