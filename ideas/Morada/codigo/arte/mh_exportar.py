"""Exporta o personagem montado (corpo do Meshy + cabeça MH com expressões + globos) para GLB.
Os globos viram filhos do osso da cabeça (sem pele), para o jogo girá-los livremente (olhar).
Uso: python mh_exportar.py <id_mh.blend> <id> <saida.glb>"""
import sys
import bpy

BLEND, PID, SAIDA = sys.argv[1:4]
bpy.ops.wm.open_mainfile(filepath=BLEND)
arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
arm.data.pose_position = "REST"
bpy.context.view_layer.update()
for lado in ("l", "r"):
    o = bpy.data.objects[f"{PID}_olho_{lado}"]
    mw = o.matrix_world.copy()
    for m in list(o.modifiers):
        o.modifiers.remove(m)
    o.vertex_groups.clear()
    o.parent = arm
    o.parent_type = "BONE"
    o.parent_bone = "mixamorig:Head"
    bpy.context.view_layer.update()
    o.matrix_world = mw
cab = bpy.data.objects[f"{PID}_cabeca"]
for k in cab.data.shape_keys.key_blocks[1:]:
    k.value = 0.0
arm.data.pose_position = "POSE"
tris = 0
for o in bpy.data.objects:
    if o.type == "MESH":
        o.data.calc_loop_triangles()
        tris += len(o.data.loop_triangles)
print("triângulos no total", tris)
bpy.ops.export_scene.gltf(filepath=SAIDA, export_format="GLB", export_animations=True, export_animation_mode="NLA_TRACKS",
                          export_morph=True, export_image_format="WEBP", export_apply=False)
print("ok")
