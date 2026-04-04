import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';

import FeedScreen from '../screens/FeedScreen';
import NewPostScreen from '../screens/NewPostScreen';
import PlanScreen from '../screens/PlanScreen';
import NewPlanScreen from '../screens/NewPlanScreen';
import KnowledgeScreen from '../screens/KnowledgeScreen';
import NewKnowledgeScreen from '../screens/NewKnowledgeScreen';
import KnowledgeDetailScreen from '../screens/KnowledgeDetailScreen';
import ProfileScreen from '../screens/ProfileScreen';
import FriendProfileScreen from '../screens/FriendProfileScreen';
import MediaViewerScreen from '../screens/MediaViewerScreen';
import PostDetailScreen from '../screens/PostDetailScreen';
import KnowledgeMediaViewerScreen from '../screens/KnowledgeMediaViewerScreen';
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();
const AuthStack = createNativeStackNavigator();
const RootStack = createNativeStackNavigator();

function FeedStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Feed" component={FeedScreen} />
      <Stack.Screen name="NewPost" component={NewPostScreen} options={{ presentation: 'modal', headerShown: false }} />
    </Stack.Navigator>
  );
}

function PlanStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Plan" component={PlanScreen} />
      <Stack.Screen name="NewPlan" component={NewPlanScreen} options={{ presentation: 'modal', headerShown: false }} />
    </Stack.Navigator>
  );
}

function KnowledgeStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Knowledge" component={KnowledgeScreen} />
      <Stack.Screen name="NewKnowledge" component={NewKnowledgeScreen} options={{ presentation: 'modal', headerShown: false }} />
      <Stack.Screen name="KnowledgeDetail" component={KnowledgeDetailScreen} />
    </Stack.Navigator>
  );
}

function ProfileStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Profile" component={ProfileScreen} />
      <Stack.Screen name="FriendProfile" component={FriendProfileScreen} />
    </Stack.Navigator>
  );
}

function MainTabs() {
  const { state } = useApp();
  const currentUser = state.currentUser;
  const myPosts = (state.posts || []).filter(post => post.userId === currentUser?.id);
  const myKnowledge = (state.knowledge || []).filter(item => item.userId === currentUser?.id);
  const currentNotification = state.notifications?.[currentUser?.id] || {};
  const readInteractionIds = new Set(state.notifications?.[currentUser?.id]?.readInteractionIds || []);
  const commentsReadAtTs = currentNotification?.commentsReadAt ? new Date(currentNotification.commentsReadAt).getTime() : 0;

  const stableInteractionKeyOf = (sourceType, sourceId, comment) => {
    const fromUserId = comment?.userId || 'unknown';
    const createdAt = comment?.createdAt || 'unknown';
    const text = String(comment?.text || '').trim();
    return `${sourceType}:${sourceId}:${fromUserId}:${createdAt}:${text}`;
  };

  const idInteractionKeyOf = (sourceType, sourceId, comment) => {
    return `${sourceType}:${comment?.id || 'unknown'}`;
  };

  const isRead = (sourceType, sourceId, comment) => {
    if (
      readInteractionIds.has(stableInteractionKeyOf(sourceType, sourceId, comment)) ||
      readInteractionIds.has(idInteractionKeyOf(sourceType, sourceId, comment))
    ) {
      return true;
    }
    if (readInteractionIds.size > 0) return false;
    const interactionTs = comment?.createdAt ? new Date(comment.createdAt).getTime() : 0;
    if (!interactionTs || !commentsReadAtTs) return false;
    return interactionTs <= commentsReadAtTs;
  };

  const unreadPostInteractions = myPosts.reduce((sum, post) => {
    const next = (post.comments || [])
      .filter(comment => comment.userId !== currentUser?.id)
      .filter(comment => !isRead('post', post.id, comment)).length;
    return sum + next;
  }, 0);

  const unreadKnowledgeInteractions = myKnowledge.reduce((sum, item) => {
    const next = (item.comments || [])
      .filter(comment => comment.userId !== currentUser?.id)
      .filter(comment => !isRead('knowledge', item.id, comment)).length;
    return sum + next;
  }, 0);

  const unreadInteractions = unreadPostInteractions + unreadKnowledgeInteractions;

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: '#C49A4B',
        tabBarInactiveTintColor: '#8A8279',
        tabBarStyle: {
          backgroundColor: '#FFFDF8',
          borderTopWidth: 1,
          borderTopColor: '#E8E1D8',
          paddingBottom: 8,
          paddingTop: 6,
          height: 62,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '500' },
        tabBarIcon: ({ color, size, focused }) => {
          const icons = {
            FeedTab: focused ? 'home' : 'home-outline',
            PlanTab: focused ? 'calendar' : 'calendar-outline',
            KnowledgeTab: focused ? 'book' : 'book-outline',
            ProfileTab: focused ? 'person' : 'person-outline',
          };
          return <Ionicons name={icons[route.name]} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="FeedTab" component={FeedStack} options={{ tabBarLabel: '动态' }} />
      <Tab.Screen name="PlanTab" component={PlanStack} options={{ tabBarLabel: '打卡' }} />
      <Tab.Screen name="KnowledgeTab" component={KnowledgeStack} options={{ tabBarLabel: '知识' }} />
      <Tab.Screen
        name="ProfileTab"
        component={ProfileStack}
        options={{
          tabBarLabel: '个人中心',
          tabBarBadge: unreadInteractions > 0 ? (unreadInteractions > 99 ? '99+' : unreadInteractions) : undefined,
          tabBarBadgeStyle: {
            backgroundColor: '#FF6B6B',
            color: '#fff',
            fontSize: 10,
            minWidth: 16,
            height: 16,
            lineHeight: 16,
          },
        }}
      />
    </Tab.Navigator>
  );
}

function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="Register" component={RegisterScreen} />
    </AuthStack.Navigator>
  );
}

function LoadingScreen() {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F7F4EE' }}>
      <ActivityIndicator size="large" color="#C49A4B" />
      <Text style={{ marginTop: 12, color: '#6E655C' }}>正在加载数据...</Text>
    </View>
  );
}

export default function AppNavigator() {
  const { state, isCloudEnabled } = useApp();

  if (!state.loaded) {
    return <LoadingScreen />;
  }

  if (!isCloudEnabled) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 24, backgroundColor: '#F7F4EE' }}>
        <View style={{ backgroundColor: '#FFFDF8', borderRadius: 14, padding: 16 }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: '#2F2A24', marginBottom: 8 }}>云端配置未完成</Text>
          <Text style={{ fontSize: 14, color: '#6E655C', lineHeight: 21 }}>
            当前版本仅支持 Supabase 云端存储。请在运行环境中配置 EXPO_PUBLIC_SUPABASE_URL、EXPO_PUBLIC_SUPABASE_ANON_KEY 与 EXPO_PUBLIC_SUPABASE_MEDIA_BUCKET，然后重启应用。
          </Text>
        </View>
      </View>
    );
  }

  return (
    <NavigationContainer>
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        {state.currentUser ? (
          <RootStack.Screen name="MainTabs" component={MainTabs} />
        ) : (
          <RootStack.Screen name="Auth" component={AuthNavigator} />
        )}
        <RootStack.Screen name="MediaViewer" component={MediaViewerScreen} />
        <RootStack.Screen name="PostDetail" component={PostDetailScreen} />
          <RootStack.Screen name="KnowledgeMediaViewer" component={KnowledgeMediaViewerScreen} />
      </RootStack.Navigator>
    </NavigationContainer>
  );
}
