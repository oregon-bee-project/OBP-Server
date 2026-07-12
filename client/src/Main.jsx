import React from 'react'
import ReactDOM from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Global, css } from '@emotion/react'

import { AuthProvider } from './AuthProvider'
import App from './App'
import LandingPage from './pages/landing/LandingPage'
import ErrorPage from './pages/error/ErrorPage'
import AdminLoginPage from './pages/adminLogin/AdminLoginPage'
import DashboardPage from './pages/dashboard/DashboardPage'
import TasksPage from './pages/tasks/TasksPage'
import DatasetsPage from './pages/datasets/DatasetsPage'
import AdminPage from './pages/admin/AdminPage'
import VolunteerLoginPage from './pages/volunteerLogin/VolunteerLoginPage'
import DeterminationsPage from './pages/determinations/DeterminationsPage'
import ProtectedRoute from './ProtectedRoute'
import ScriptsPage from './pages/scripts/ScriptsPage'

const queryClient = new QueryClient()

const router = createBrowserRouter([
    {
        path: '/',
        element: <App />,
        errorElement: <App><ErrorPage /></App>,
        children: [
            { index: true, element: <LandingPage /> },
            { path: 'adminLogin', element: <AdminLoginPage /> },
            { path: 'dashboard', element: <DashboardPage /> },
            {
                element: <ProtectedRoute />,
                children: [
                    { path: 'tasks', element: <TasksPage /> },
                    { path: 'datasets', element: <DatasetsPage /> },
                    { path: 'scripts', element: <ScriptsPage /> },
                    { path: 'admin', element: <AdminPage /> },
                ]
            },
            { path: 'volunteerLogin', element: <VolunteerLoginPage /> },
            { path: 'determinations', element: <DeterminationsPage /> }
        ]
    }
])

const globalStyles = css`
    html {
        font-family: 'Helvetica', sans-serif;

        color: #222;

        --occurrences-file-color: #ceb721;
        --duplicates-file-color: #d75fdd;
        --pulls-file-color: #00e068;
        --flags-file-color: #c33333;
        --labels-file-color: #2916fc;
        --addresses-file-color: #930082;
        --emails-file-color: #07b2b2;
        --pivots-file-color: #9794f7;
        --mismatches-file-color: #8f3400ff;
    }

    body {
        margin: 0px;
    }
`

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <QueryClientProvider client={queryClient}>
            <Global styles={globalStyles} />
            <AuthProvider>
                <RouterProvider router={router} />
            </AuthProvider>
        </QueryClientProvider>
    </React.StrictMode>
)
