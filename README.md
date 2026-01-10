# LazarFlow Admin Dashboard

A React admin dashboard for LazarFlow that authenticates users through Supabase and checks admin permissions.

## Features

- Supabase authentication
- Admin role verification via `profiles` table
- Automatic redirect to main app for non-admin users
- Clean, modern UI with responsive design
- Dashboard with admin management sections

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Environment Configuration:**
   - Copy `.env.example` to `.env`
   - Add your Supabase project URL and anon key:
     ```
     VITE_SUPABASE_URL=your_supabase_project_url
     VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
     ```

3. **Database Setup:**
   
   Ensure your Supabase database has a `profiles` table with the following structure:
   ```sql
   CREATE TABLE profiles (
     id UUID REFERENCES auth.users(id) PRIMARY KEY,
     email TEXT,
     full_name TEXT,
     is_admin BOOLEAN DEFAULT FALSE,
     created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
     updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
   );
   
   -- Enable RLS
   ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
   
   -- Policy to allow users to read their own profile
   CREATE POLICY "Users can view own profile" ON profiles
     FOR SELECT USING (auth.uid() = id);
   ```

4. **Run the development server:**
   ```bash
   npm run dev
   ```

## How it Works

1. **Authentication Flow:**
   - User enters email/password on login page
   - App authenticates with Supabase Auth
   - App checks `profiles.is_admin` for the authenticated user
   - If `is_admin` is `true`, user accesses the dashboard
   - If `is_admin` is `false` or null, user is redirected to `https://lazarflow.app/login`

2. **Admin Dashboard:**
   - Shows welcome message with user info
   - Provides navigation to different admin sections
   - Includes logout functionality

## Project Structure

```
src/
├── components/
│   ├── LoginPage.jsx       # Login form with Supabase auth
│   ├── LoginPage.css       # Login page styles
│   ├── Dashboard.jsx       # Main admin dashboard
│   └── Dashboard.css       # Dashboard styles
├── lib/
│   └── supabase.js        # Supabase client configuration
├── App.jsx                # Main app component with auth logic
└── App.css                # Global app styles
```

## Deployment

1. Build the project:
   ```bash
   npm run build
   ```

2. Deploy the `dist` folder to your hosting provider

3. Ensure environment variables are set in your production environment

## Security Notes

- The app uses Supabase Row Level Security (RLS) for database access
- Admin status is verified on both login and session restoration
- Non-admin users are automatically redirected to the main application
- All API calls are made through Supabase's secure client