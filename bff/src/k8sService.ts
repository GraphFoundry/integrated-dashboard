import * as k8s from '@kubernetes/client-node'

export class K8sService {
    private k8sApi: k8s.CoreV1Api

    constructor() {
        const kc = new k8s.KubeConfig()
        try {
            kc.loadFromDefault()
        } catch (e) {
            console.warn('Failed to load Kubernetes config from default. Falling back to cluster config.')
            try {
                kc.loadFromCluster()
            } catch (e2) {
                console.error('Failed to load Kubernetes config from cluster.', e2)
            }
        }
        this.k8sApi = kc.makeApiClient(k8s.CoreV1Api)
    }

    async getConfigMap(namespace: string, name: string): Promise<Record<string, string> | null> {
        try {
            const response = await this.k8sApi.readNamespacedConfigMap({ name, namespace })
            return response.data || {}
        } catch (error: any) {
            if (error.response?.statusCode === 404) {
                return null
            }
            throw error
        }
    }

    async updateConfigMap(namespace: string, name: string, data: Record<string, string>): Promise<void> {
        try {
            // Try to patch first
            await this.k8sApi.patchNamespacedConfigMap({
                name,
                namespace,
                body: { data },
            }, {
                headers: { 'Content-Type': 'application/merge-patch+json' }
            } as any)
        } catch (error: any) {
            if (error.response?.statusCode === 404) {
                // Create if not exists
                await this.k8sApi.createNamespacedConfigMap({
                    namespace,
                    body: {
                        metadata: { name, namespace },
                        data,
                    }
                })
            } else {
                throw error
            }
        }
    }

    async getSecret(namespace: string, name: string): Promise<Record<string, string> | null> {
        try {
            const response = await this.k8sApi.readNamespacedSecret({ name, namespace })
            const data = response.data || {}
            // Decode base64
            const decoded: Record<string, string> = {}
            for (const [key, value] of Object.entries(data)) {
                if (typeof value === 'string') {
                    decoded[key] = Buffer.from(value, 'base64').toString('utf-8')
                }
            }
            return decoded
        } catch (error: any) {
            if (error.response?.statusCode === 404) {
                return null
            }
            throw error
        }
    }

    async updateSecret(namespace: string, name: string, data: Record<string, string>): Promise<void> {
        // Encode to base64
        const encoded: Record<string, string> = {}
        for (const [key, value] of Object.entries(data)) {
            encoded[key] = Buffer.from(value).toString('base64')
        }

        try {
            await this.k8sApi.patchNamespacedSecret({
                name,
                namespace,
                body: { data: encoded },
            }, {
                headers: { 'Content-Type': 'application/merge-patch+json' }
            } as any)
        } catch (error: any) {
            if (error.response?.statusCode === 404) {
                await this.k8sApi.createNamespacedSecret({
                    namespace,
                    body: {
                        metadata: { name, namespace },
                        data: encoded,
                    }
                })
            } else {
                throw error
            }
        }
    }
}
