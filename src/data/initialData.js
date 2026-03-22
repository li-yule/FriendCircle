// 初始化数据 - 模拟几个好友
export const INITIAL_USERS = [
  {
    id: 'user_1',
    name: '小明',
    account: 'xiaoming',
    password: '123456',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=xiaoming',
    avatarColor: '#FF6B6B',
    bio: '生活就是要快乐',
    friends: ['user_2', 'user_3'],
    subjects: ['数学', '英语'],
  },
  {
    id: 'user_2',
    name: '小红',
    account: 'xiaohong',
    password: '123456',
    avatar: null,
    avatarColor: '#FF85A1',
    bio: '努力学习，天天向上',
    friends: ['user_3', 'user_4'],
    subjects: ['英语', '语文', '历史'],
  },
  {
    id: 'user_3',
    name: '小刚',
    account: 'xiaogang',
    password: '123456',
    avatar: null,
    avatarColor: '#4ECDC4',
    bio: '代码改变世界',
    friends: ['user_2', 'user_4'],
    subjects: ['数学', '物理', '化学'],
  },
  {
    id: 'user_4',
    name: '小美',
    account: 'xiaomei',
    password: '123456',
    avatar: null,
    avatarColor: '#FFE66D',
    bio: '每天都要开心',
    friends: ['user_2', 'user_3'],
    subjects: ['生物', '地理', '政治'],
  },
];

export const DEFAULT_SUBJECTS = ['数学', '英语', '语文', '物理', '化学', '生物', '历史', '地理', '政治'];
