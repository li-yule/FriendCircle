1. 在 Supabase 新建一个云项目，不要用本地数据库。
2. 打开 SQL Editor，执行 schema.sql。这个脚本会自动建表、建 media bucket，并配置基础权限。
3. 在 Authentication 里关闭 Confirm email，否则手机号/平板注册后不会直接可用。
4. 把项目的 URL 和 anon key 填到 .env 或 EAS 环境变量里。
5. Expo/EAS 构建时需要注入这三个变量：EXPO_PUBLIC_SUPABASE_URL、EXPO_PUBLIC_SUPABASE_ANON_KEY、EXPO_PUBLIC_SUPABASE_MEDIA_BUCKET。
