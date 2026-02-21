import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../lib/supabase';
import bcrypt from 'bcryptjs';

/**
 * POST /api/seed
 * Seeds the database with initial data. Should only be called once after deploy.
 * Protect this with a secret key in production.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    // Basic protection — require a seed token matching ADMIN_PASSWORD
    const { token } = req.body || {};
    if (token !== process.env.ADMIN_PASSWORD) {
        return res.status(403).json({ error: 'Forbidden' });
    }

    try {
        // Admin user
        const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
        const hashedPassword = bcrypt.hashSync(adminPassword, 10);
        const { error: userErr } = await supabase
            .from('users')
            .upsert({ username: 'admin', password: hashedPassword }, { onConflict: 'username' });
        if (userErr) console.error('❌ Error upserting admin user:', userErr.message);

        // Settings
        const { data: settings } = await supabase.from('settings').select('key').limit(1);
        if (!settings || settings.length === 0) {
            await supabase.from('settings').insert([
                { key: 'companyName', value: 'Ferreira Calhas' },
                { key: 'whatsapp', value: '5566996172808' },
                { key: 'address', value: 'Avenida Jose Goncalves, 931, Sinop - MT, Brasil' },
                { key: 'aboutText', value: 'Especialistas em fabricação e instalação de calhas, rufos e pingadeiras em Sinop e região. Qualidade e compromisso com o seu projeto.' },
                { key: 'heroTitle', value: 'Proteção e Estética para o seu Telhado' },
                { key: 'heroSubtitle', value: 'Fabricação própria de calhas e rufos com a qualidade que sua obra merece.' },
                { key: 'logoUrl', value: '' },
            ]);
        }

        // Testimonials
        const { data: testimonials } = await supabase.from('testimonials').select('id').limit(1);
        if (!testimonials || testimonials.length === 0) {
            await supabase.from('testimonials').insert([
                { author: 'Ricardo Silva', content: 'Serviço de excelente qualidade. As calhas ficaram perfeitas e o atendimento foi muito profissional.', rating: 5 },
                { author: 'Maria Oliveira', content: 'Fiquei muito satisfeita com o trabalho da Ferreira Calhas. Recomendo a todos em Sinop.', rating: 5 },
                { author: 'João Pereira', content: 'Preço justo e entrega no prazo. Nota 10!', rating: 5 },
            ]);
        }

        // Services + Gallery
        const { data: services } = await supabase.from('services').select('id').limit(1);
        if (!services || services.length === 0) {
            const { data: insertedServices } = await supabase.from('services').insert([
                { title: 'Calhas', description: 'Instalação de calhas sob medida para residências e comércios.', imageUrl: 'https://images.unsplash.com/photo-1635424710928-0544e8512eae?q=80&w=800' },
                { title: 'Rufos', description: 'Proteção metálica essencial para evitar infiltrações.', imageUrl: 'https://picsum.photos/seed/rufo/800/600' },
                { title: 'Pingadeiras', description: 'Acabamento superior para muros que protege a pintura.', imageUrl: 'https://picsum.photos/seed/pingadeira/800/600' },
                { title: 'Fabricação Própria', description: 'Maquinário moderno para dobrar chapas sob medida.', imageUrl: 'https://picsum.photos/seed/fabricacao/800/600' },
                { title: 'Equipe e Obras', description: 'Nossa equipe em ação e registros de obras concluídas.', imageUrl: 'https://picsum.photos/seed/equipe/800/600' },
            ]).select();

            if (insertedServices && insertedServices.length === 5) {
                const [s1, s2, s3, s4, s5] = insertedServices;
                const galleryItems: { imageUrl: string; description: string; serviceId: number }[] = [];

                [1, 20, 21, 22, 23, 24, 25].forEach(n =>
                    galleryItems.push({ imageUrl: `https://picsum.photos/seed/${n}/800/600`, description: `Calha Projeto ${n}`, serviceId: s1.id }));
                [2, 3, 4, 5, 6].forEach(n =>
                    galleryItems.push({ imageUrl: `https://picsum.photos/seed/${n}/800/600`, description: `Rufo Projeto ${n}`, serviceId: s2.id }));
                [10, 11, 12, 13].forEach(n =>
                    galleryItems.push({ imageUrl: `https://picsum.photos/seed/${n}/800/600`, description: `Pingadeira Projeto ${n}`, serviceId: s3.id }));
                [38, 39, 40, 41].forEach(n =>
                    galleryItems.push({ imageUrl: `https://picsum.photos/seed/${n}/800/600`, description: `Fabricação Própria ${n}`, serviceId: s4.id }));
                [9, 34, 35].forEach(n =>
                    galleryItems.push({ imageUrl: `https://picsum.photos/seed/${n}/800/600`, description: `Equipe e Obras ${n}`, serviceId: s5.id }));

                await supabase.from('gallery').insert(galleryItems);
            }
        }

        return res.json({ success: true, message: 'Database seeded successfully' });
    } catch (error) {
        console.error('Seed error:', error);
        return res.status(500).json({ error: 'Seed failed' });
    }
}
