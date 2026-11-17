import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { withHistoricalDatabase } from "./testing/historical-database";

it("upgrades historical Agenda households, original privacy and independent notification consent", async () => {
  await withHistoricalDatabase(async ({ connection, migrateTo }) => {
    const first = randomUUID(),
      second = randomUUID(),
      guest = randomUUID();
    const a = randomUUID(),
      sibling = randomUUID(),
      b = randomUUID();
    for (const id of [first, second, guest])
      await connection`insert into core.users(id,name,email,email_verified,created_at,updated_at)
    values(${id},'Synthetic',${`${id}@example.test`},true,now(),now())`;
    for (const { profile, owner } of [
      { profile: a, owner: first },
      { profile: sibling, owner: first },
      { profile: b, owner: second },
    ])
      await connection`insert into agenda.student_profiles(id,user_id,name) values(${profile},${owner},'Same name')`;
    for (const { owner, profile } of [
      { owner: first, profile: a },
      { owner: second, profile: b },
    ]) {
      const member = randomUUID();
      await connection`insert into agenda.family_members(id,owner_user_id,user_id) values(${member},${owner},${guest})`;
      await connection`insert into agenda.family_profile_access(member_id,profile_id) values(${member},${profile})`;
    }
    await connection`insert into agenda.notification_preferences(user_id,email_enabled,push_enabled,digest_hour,quiet_start,quiet_end)
    values(${guest},true,true,18,22,6),(${first},false,false,17,22,6)`;
    const privateId = randomUUID(),
      sharedId = randomUUID();
    await connection`insert into agenda.notices(id,owner_user_id,created_by_user_id,source,text,content_hash,status)
    values(${privateId},${first},${first},'other','Private retained original','private','confirmed')`;
    await connection`insert into agenda.notices(id,owner_user_id,created_by_user_id,source,text,content_hash,status,source_profile_ids)
    values(${sharedId},${first},${first},'other','Reviewed original','shared','confirmed',${JSON.stringify([a])}::jsonb)`;
    await connection`insert into agenda.family_settings(user_id,first_steps_dismissed_at) values(${first},now())`;
    await migrateTo();
    const origins =
      await connection`select source_owner_id,group_id from family.migration_sources where app='agenda-da-turma' order by source_owner_id`;
    const firstGroup = origins.find((o) => o.source_owner_id === first)?.group_id;
    const secondGroup = origins.find((o) => o.source_owner_id === second)?.group_id;
    expect(firstGroup).toBeTruthy();
    expect(secondGroup).not.toBe(firstGroup);
    const profiles =
      await connection`select fp.person_id,fp.group_id from agenda.student_profiles p join family.app_profiles fp on fp.id=p.family_profile_id`;
    expect(new Set(profiles.map((p) => p.person_id)).size).toBe(3);
    const preferences =
      await connection`select family_group_id,email_enabled,push_enabled,digest_hour from agenda.notification_preferences where user_id=${guest}`;
    expect(new Set(preferences.map((p) => p.family_group_id))).toEqual(
      new Set([firstGroup, secondGroup]),
    );
    expect(
      preferences.every((p) => p.email_enabled && p.push_enabled && p.digest_hour === 18),
    ).toBe(true);
    const [privateNotice] =
      await connection`select family_group_id,shared_within_family,source_profile_ids,text from agenda.notices where id=${privateId}`;
    expect(privateNotice?.family_group_id).toBe(firstGroup);
    expect(privateNotice?.shared_within_family).toBe(false);
    expect(new Set(privateNotice?.source_profile_ids)).toEqual(new Set([a, sibling]));
    expect(privateNotice?.text).toBe("Private retained original");
    const [sharedNotice] =
      await connection`select shared_within_family,source_profile_ids from agenda.notices where id=${sharedId}`;
    expect(sharedNotice?.shared_within_family).toBe(true);
    expect(sharedNotice?.source_profile_ids).toEqual([a]);
    expect(
      (
        await connection`select family_group_id from agenda.family_settings where user_id=${first}`
      )[0]?.family_group_id,
    ).toBe(firstGroup);
    const [identityContract] = await connection`
      select is_nullable as nullable,
        (select count(*)::int from information_schema.columns where table_schema='agenda'
          and ((table_name='student_profiles' and column_name in ('user_id','name'))
            or (table_name='notices' and column_name='owner_user_id'))) as obsolete_columns,
        (select count(*)::int from information_schema.tables where table_schema='agenda'
          and table_name in ('family_members','family_profile_access','family_invitations')) as obsolete_tables
      from information_schema.columns where table_schema='agenda' and table_name='student_profiles'
        and column_name='family_profile_id'`;
    expect(identityContract).toEqual({ nullable: "NO", obsolete_columns: 0, obsolete_tables: 0 });
    expect(
      (
        await connection`select is_nullable from information_schema.columns where table_schema='agenda'
      and table_name='notices' and column_name='family_group_id'`
      )[0]?.is_nullable,
    ).toBe("NO");
    await expect(
      connection`insert into agenda.student_profiles(id) values(${randomUUID()})`,
    ).rejects.toMatchObject({ code: "23502" });
    const names = await connection`select p.display_name from agenda.student_profiles native
      join family.app_profiles a on a.id=native.family_profile_id join family.people p on p.id=a.person_id`;
    expect(names.map((row) => row.display_name)).toEqual(["Same name", "Same name", "Same name"]);
    await migrateTo();
    expect(
      (await connection`select id from agenda.notification_preferences where user_id=${guest}`)
        .length,
    ).toBe(2);
  });
}, 60000);
