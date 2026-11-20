import { randomUUID } from "node:crypto";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { expect, it } from "vitest";
import { limitarClienteALeituraDaCaptura } from "../scripts/backup/leitura-s3";
import { criarBucketS3DeTeste } from "./objetos-s3-apoio";

it("blocks write/list and cross-capture or foreign-bucket reads before the actual SDK sends HTTP", async () => {
  const http = await criarBucketS3DeTeste(),
    id = randomUUID(),
    bucket = "recreio-recovery-fixture";
  try {
    const contador = limitarClienteALeituraDaCaptura(http.cliente, { bucket, capturaId: id });
    await expect(
      http.cliente.send(
        new GetObjectCommand({ Bucket: bucket, Key: `recreio/v1/backup/${id}/manifesto.json` }),
      ),
    ).rejects.toMatchObject({ name: "NoSuchKey" });
    const pedidos = http.pedidos.length;
    expect(pedidos).toBe(1);
    expect(contador.requisicoes()).toBe(1);
    for (const command of [
      new PutObjectCommand({
        Bucket: bucket,
        Key: `recreio/v1/backup/${id}/manifesto.json`,
        Body: "synthetic",
      }),
      new DeleteObjectCommand({ Bucket: bucket, Key: `recreio/v1/backup/${id}/manifesto.json` }),
      new ListObjectsV2Command({ Bucket: bucket }),
      new GetObjectCommand({
        Bucket: "foreign-bucket",
        Key: `recreio/v1/backup/${id}/manifesto.json`,
      }),
      new GetObjectCommand({
        Bucket: bucket,
        Key: `recreio/v1/backup/${randomUUID()}/manifesto.json`,
      }),
      new GetObjectCommand({
        Bucket: bucket,
        Key: `recreio/v1/backup/${id}/nested/manifesto.json`,
      }),
    ])
      await expect(http.cliente.send(command)).rejects.toThrow("BACKUP_RECOVERY_COMMAND_REFUSED");
    expect(http.pedidos.length).toBe(pedidos);
    expect(contador.requisicoes()).toBe(1);
  } finally {
    await http.fechar();
  }
});
